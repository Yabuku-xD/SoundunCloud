import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import {
  ArrowUpRight,
  ExternalLink,
  LoaderCircle,
  Minus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { type MouseEvent, useEffect, useEffectEvent, useState } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";

const windowHandle = getCurrentWebviewWindow();

const SOUNDCLOUD_WEBVIEW_LABEL = "soundcloud-shell";
const SOUNDCLOUD_HOME_URL = "https://soundcloud.com";
const SHELL_PADDING = 18;
const CHROME_HEIGHT = 72;
const FOOTER_HEIGHT = 64;
const MIN_WEBVIEW_HEIGHT = 360;
const MIN_WEBVIEW_WIDTH = 640;

type AvailableUpdate = Exclude<Awaited<ReturnType<typeof check>>, null>;
type ShellPhase = "launching" | "ready" | "error";

type UpdateFabState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ready"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "manual"; version: string; url: string; detail?: string }
  | { kind: "current" }
  | { kind: "error"; detail?: string };

function AppRoot() {
  const [shellPhase, setShellPhase] = useState<ShellPhase>("launching");
  const [shellError, setShellError] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateFabState, setUpdateFabState] = useState<UpdateFabState>({
    kind: "idle",
  });

  const isCheckingUpdates = updateFabState.kind === "checking";
  const isInstallingUpdate = updateFabState.kind === "installing";

  const handleChromePointerDown = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button, input, a, [data-no-drag]")) {
      return;
    }

    void invoke("main_window_start_dragging");
  };

  const syncShellWebviewBounds = useEffectEvent(async () => {
    const shellWebview = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (!shellWebview) {
      return;
    }

    const [innerSize, scaleFactor] = await Promise.all([
      windowHandle.innerSize(),
      windowHandle.scaleFactor(),
    ]);

    const width = Math.max(
      MIN_WEBVIEW_WIDTH,
      innerSize.width / scaleFactor - SHELL_PADDING * 2,
    );
    const height = Math.max(
      MIN_WEBVIEW_HEIGHT,
      innerSize.height / scaleFactor - CHROME_HEIGHT - FOOTER_HEIGHT,
    );

    await Promise.all([
      shellWebview.setPosition(new LogicalPosition(SHELL_PADDING, CHROME_HEIGHT)),
      shellWebview.setSize(new LogicalSize(width, height)),
    ]);
  });

  const ensureShellWebview = useEffectEvent(async () => {
    setShellPhase("launching");
    setShellError(null);

    const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (existing) {
      await syncShellWebviewBounds();
      await existing.show();
      await existing.setFocus();
      setShellPhase("ready");
      return;
    }

    const [innerSize, scaleFactor] = await Promise.all([
      windowHandle.innerSize(),
      windowHandle.scaleFactor(),
    ]);

    const width = Math.max(
      MIN_WEBVIEW_WIDTH,
      innerSize.width / scaleFactor - SHELL_PADDING * 2,
    );
    const height = Math.max(
      MIN_WEBVIEW_HEIGHT,
      innerSize.height / scaleFactor - CHROME_HEIGHT - FOOTER_HEIGHT,
    );

    const shellWebview = new Webview(windowHandle, SOUNDCLOUD_WEBVIEW_LABEL, {
      url: SOUNDCLOUD_HOME_URL,
      x: SHELL_PADDING,
      y: CHROME_HEIGHT,
      width,
      height,
      focus: true,
      dataDirectory: "soundcloud-web-shell",
      backgroundColor: "#050506",
      zoomHotkeysEnabled: true,
    });

    void shellWebview.once("tauri://created", () => {
      setShellPhase("ready");
      setShellError(null);
      void syncShellWebviewBounds();
    });

    void shellWebview.once("tauri://error", (event) => {
      setShellPhase("error");
      setShellError(
        formatUnknownError(
          event.payload,
          "SoundunCloud could not launch the embedded SoundCloud shell.",
        ),
      );
    });
  });

  const recreateShellWebview = useEffectEvent(async () => {
    const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (existing) {
      await existing.close();
    }

    await ensureShellWebview();
  });

  const checkForUpdates = useEffectEvent(async () => {
    setAvailableUpdate(null);
    setUpdateFabState({ kind: "checking" });

    try {
      const update = await Promise.race<AvailableUpdate | null>([
        check({ timeout: 4000 }),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 4500);
        }),
      ]);

      if (update) {
        setAvailableUpdate(update);
        setUpdateFabState({
          kind: "ready",
          version: update.version,
        });
        return;
      }

      setUpdateFabState({ kind: "current" });
    } catch (error) {
      setAvailableUpdate(null);
      setUpdateFabState({
        kind: "error",
        detail: formatUnknownError(
          error,
          "SoundunCloud could not check for updates right now.",
        ),
      });
    }
  });

  const handleInstallUpdate = async () => {
    if (!availableUpdate) {
      return;
    }

    setUpdateFabState({
      kind: "installing",
      version: availableUpdate.version,
    });

    try {
      await availableUpdate.downloadAndInstall(undefined, {
        timeout: 180000,
      });
      setAvailableUpdate(null);
      setUpdateFabState({ kind: "current" });
    } catch (error) {
      const detail = formatUnknownError(
        error,
        "SoundunCloud could not install the update automatically.",
      );
      const installerUrl = getInstallerUrl(availableUpdate);

      if (installerUrl) {
        setUpdateFabState({
          kind: "manual",
          version: availableUpdate.version,
          url: installerUrl,
          detail,
        });
        return;
      }

      setUpdateFabState({
        kind: "error",
        detail,
      });
    }
  };

  const handleUpdateAction = async () => {
    if (isCheckingUpdates || isInstallingUpdate) {
      return;
    }

    if (updateFabState.kind === "manual") {
      await openUrl(updateFabState.url);
      return;
    }

    if (availableUpdate) {
      await handleInstallUpdate();
      return;
    }

    await checkForUpdates();
  };

  const handleOpenInBrowser = async () => {
    await openUrl(SOUNDCLOUD_HOME_URL);
  };

  useEffect(() => {
    void windowHandle.center();
    void ensureShellWebview();

    let cancelled = false;

    const resizeListener = windowHandle.onResized(() => {
      if (!cancelled) {
        void syncShellWebviewBounds();
      }
    });

    const scaleListener = windowHandle.onScaleChanged(() => {
      if (!cancelled) {
        void syncShellWebviewBounds();
      }
    });

    return () => {
      cancelled = true;
      void resizeListener.then((unlisten) => unlisten());
      void scaleListener.then((unlisten) => unlisten());
    };
  }, [ensureShellWebview, syncShellWebviewBounds]);

  useEffect(() => {
    if (updateFabState.kind !== "current" && updateFabState.kind !== "error") {
      return;
    }

    const timer = window.setTimeout(() => {
      setUpdateFabState((current) =>
        current.kind === updateFabState.kind ? { kind: "idle" } : current,
      );
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [updateFabState]);

  const updateFabLabel = buildUpdateFabLabel(updateFabState);
  const updateFabTitle = buildUpdateFabTitle(updateFabState);
  const updateFabToneClass =
    updateFabState.kind === "ready" || updateFabState.kind === "manual"
      ? "update-fab--ready"
      : updateFabState.kind === "error"
        ? "update-fab--error"
        : updateFabState.kind === "current"
          ? "update-fab--quiet"
          : "";

  return (
    <div className="shell">
      <div className="shell__ambient" />

      <header className="chrome" onMouseDown={handleChromePointerDown}>
        <div className="chrome__bar">
          <div className="chrome__brand">
            <img alt="SoundCloud" className="chrome__logo" src={soundCloudLogoWhite} />
            <div className="chrome__copy">
              <strong>SoundunCloud</strong>
              <span>Local SoundCloud web shell</span>
            </div>
          </div>

          <div className="chrome__actions" data-no-drag>
            <button
              className="utility-chip"
              onClick={() => void recreateShellWebview()}
              type="button"
            >
              <RefreshCw size={13} />
              <span>Reload</span>
            </button>
            <button
              className="utility-chip"
              onClick={() => void handleOpenInBrowser()}
              type="button"
            >
              <ExternalLink size={13} />
              <span>Browser</span>
            </button>
            <WindowControls />
          </div>
        </div>
      </header>

      <main className="viewport">
        {shellPhase !== "ready" ? (
          <LaunchOverlay
            detail={
              shellPhase === "error"
                ? shellError ??
                  "SoundunCloud could not launch the embedded SoundCloud shell."
                : "No hosting required. SoundCloud opens inside the app and keeps its web session on this device."
            }
            isError={shellPhase === "error"}
            onOpenInBrowser={handleOpenInBrowser}
            onRetry={recreateShellWebview}
          />
        ) : null}
      </main>

      <footer className="footer">
        <div className="footer__bar">
          <p className="footer__copy">
            {shellPhase === "ready"
              ? "Sign in on the SoundCloud site once and this device stays signed in there."
              : "Preparing the embedded SoundCloud session."}
          </p>

          <button
            aria-live="polite"
            className={`update-fab ${updateFabToneClass}`}
            data-no-drag
            disabled={isCheckingUpdates || isInstallingUpdate}
            onClick={() => void handleUpdateAction()}
            title={updateFabTitle}
            type="button"
          >
            {isCheckingUpdates || isInstallingUpdate ? (
              <LoaderCircle className="spin" size={11} />
            ) : (
              <ArrowUpRight size={11} />
            )}
            <span>{updateFabLabel}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

type LaunchOverlayProps = {
  detail: string;
  isError: boolean;
  onOpenInBrowser: () => Promise<void>;
  onRetry: () => Promise<void>;
};

function LaunchOverlay({
  detail,
  isError,
  onOpenInBrowser,
  onRetry,
}: LaunchOverlayProps) {
  return (
    <section className="launch-overlay" aria-live="polite">
      <div className="launch-overlay__stack">
        <img alt="SoundCloud" className="launch-overlay__logo" src={soundCloudLogoWhite} />
        <p className="launch-overlay__eyebrow">
          {isError ? "Shell launch failed" : "Opening SoundCloud"}
        </p>
        <h1>
          {isError
            ? "SoundCloud could not load in the desktop shell."
            : "Your likes, feed, and account stay on the real SoundCloud site."}
        </h1>
        <p className="launch-overlay__detail">{detail}</p>

        <div className="launch-overlay__actions">
          {isError ? (
            <button className="button button--primary" onClick={() => void onRetry()} type="button">
              <RefreshCw size={15} />
              Retry inside app
            </button>
          ) : (
            <button className="button button--primary" type="button">
              <LoaderCircle className="spin" size={15} />
              Loading SoundCloud
            </button>
          )}
          <button
            className="button button--ghost"
            onClick={() => void onOpenInBrowser()}
            type="button"
          >
            <ExternalLink size={15} />
            Open in browser
          </button>
        </div>
      </div>
    </section>
  );
}

function WindowControls() {
  const handleMinimize = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void invoke("main_window_minimize");
  };

  const handleToggleMaximize = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void invoke("main_window_toggle_maximize");
  };

  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void invoke("main_window_close");
  };

  return (
    <div className="window-frame__controls" data-no-drag>
      <button
        aria-label="Minimize window"
        className="window-frame__button"
        data-no-drag
        onClick={handleMinimize}
        onMouseDown={(event) => event.stopPropagation()}
        type="button"
      >
        <Minus size={14} />
      </button>
      <button
        aria-label="Maximize or restore window"
        className="window-frame__button"
        data-no-drag
        onClick={handleToggleMaximize}
        onMouseDown={(event) => event.stopPropagation()}
        type="button"
      >
        <Square size={12} />
      </button>
      <button
        aria-label="Close window"
        className="window-frame__button window-frame__button--danger"
        data-no-drag
        onClick={handleClose}
        onMouseDown={(event) => event.stopPropagation()}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default AppRoot;

function getInstallerUrl(update: AvailableUpdate) {
  const platforms = update.rawJson.platforms;

  if (!platforms || typeof platforms !== "object") {
    return null;
  }

  for (const key of ["windows-x86_64", "windows-aarch64", "windows-i686"]) {
    const candidate = (platforms as Record<string, unknown>)[key];

    if (
      candidate &&
      typeof candidate === "object" &&
      "url" in candidate &&
      typeof (candidate as { url?: unknown }).url === "string"
    ) {
      return (candidate as { url: string }).url;
    }
  }

  return null;
}

function formatUnknownError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return fallback;
}

function buildUpdateFabLabel(state: UpdateFabState) {
  switch (state.kind) {
    case "checking":
      return "Checking…";
    case "ready":
      return "Update available";
    case "installing":
      return "Installing…";
    case "manual":
      return "Download setup";
    case "current":
      return "Up to date";
    case "error":
      return "Try again";
    default:
      return "Check updates";
  }
}

function buildUpdateFabTitle(state: UpdateFabState) {
  switch (state.kind) {
    case "ready":
      return `SoundunCloud v${state.version} is ready to install.`;
    case "installing":
      return `Installing SoundunCloud v${state.version}.`;
    case "manual":
      return `${state.detail ?? "Automatic install failed."} Use the setup installer instead.`;
    case "current":
      return "SoundunCloud is already up to date.";
    case "error":
      return state.detail ?? "SoundunCloud could not check for updates.";
    default:
      return "Check for updates";
  }
}
