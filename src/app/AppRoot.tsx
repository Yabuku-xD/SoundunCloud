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
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";

const windowHandle = getCurrentWebviewWindow();

const SOUNDCLOUD_WEBVIEW_LABEL = "soundcloud-shell";
const SOUNDCLOUD_HOME_URL = "https://soundcloud.com/signin";
const SHELL_PADDING = 18;
const SHELL_TOP_INSET = 78;
const SHELL_BOTTOM_INSET = 82;
const MIN_WEBVIEW_HEIGHT = 420;
const MIN_WEBVIEW_WIDTH = 720;

type AvailableUpdate = Exclude<Awaited<ReturnType<typeof check>>, null>;
type ShellPhase = "idle" | "launching" | "ready" | "error";

type UpdateFabState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ready"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "manual"; version: string; url: string; detail?: string }
  | { kind: "current" }
  | { kind: "error"; detail?: string };

function AppRoot() {
  const [shellPhase, setShellPhase] = useState<ShellPhase>("idle");
  const [shellError, setShellError] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateFabState, setUpdateFabState] = useState<UpdateFabState>({
    kind: "idle",
  });

  const isCheckingUpdates = updateFabState.kind === "checking";
  const isInstallingUpdate = updateFabState.kind === "installing";

  const handleShellPointerDown = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button, input, a, [data-no-drag]")) {
      return;
    }

    void invoke("main_window_start_dragging");
  };

  const syncShellWebviewBounds = useCallback(async () => {
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
      innerSize.height / scaleFactor - SHELL_TOP_INSET - SHELL_BOTTOM_INSET,
    );

    await Promise.all([
      shellWebview.setPosition(new LogicalPosition(SHELL_PADDING, SHELL_TOP_INSET)),
      shellWebview.setSize(new LogicalSize(width, height)),
    ]);
  }, []);

  const ensureShellWebview = useCallback(async () => {
    setShellPhase("launching");
    setShellError(null);

    try {
      const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
      if (existing) {
        await syncShellWebviewBounds();
        await existing.show();
        await existing.setFocus();
        setShellPhase("ready");
        return;
      }

      await invoke("launch_soundcloud_shell");

      const shellWebview = await waitForShellWebview();
      if (!shellWebview) {
        throw new Error("SoundunCloud created the shell, but it never became addressable.");
      }

      await syncShellWebviewBounds();
      await shellWebview.show();
      await shellWebview.setFocus();
      setShellError(null);
      setShellPhase("ready");
    } catch (error) {
      setShellPhase("error");
      setShellError(
        formatUnknownError(
          error,
          "SoundunCloud could not launch the embedded SoundCloud shell.",
        ),
      );
    }
  }, [syncShellWebviewBounds]);

  const restoreShellWebview = useCallback(async () => {
    try {
      const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
      if (!existing) {
        setShellPhase("idle");
        return;
      }

      await syncShellWebviewBounds();
      await existing.show();
      setShellPhase("ready");
    } catch {
      setShellPhase("idle");
    }
  }, [syncShellWebviewBounds]);

  const recreateShellWebview = useCallback(async () => {
    const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (existing) {
      await existing.close();
    }

    await ensureShellWebview();
  }, [ensureShellWebview]);

  const checkForUpdates = useCallback(async () => {
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
  }, []);

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
    void restoreShellWebview();

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
  }, [restoreShellWebview, syncShellWebviewBounds]);

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
    <div className={`shell ${shellPhase === "ready" ? "shell--active" : ""}`}>
      <div className="shell__ambient" />

      <div className="window-frame">
        <div className="window-frame__drag-strip" onMouseDown={handleShellPointerDown} />
        <WindowControls />
      </div>

      <main className="shell__stage" onMouseDown={handleShellPointerDown}>
        {shellPhase !== "ready" ? (
          <LaunchGate
            detail={
              shellPhase === "error"
                ? shellError ??
                  "SoundunCloud could not launch the embedded SoundCloud shell."
                : "Open the real SoundCloud site inside the desktop app. Sign in there once and this device keeps that local web session."
            }
            isError={shellPhase === "error"}
            isLaunching={shellPhase === "launching"}
            onLaunch={ensureShellWebview}
            onOpenInBrowser={handleOpenInBrowser}
            onRetry={recreateShellWebview}
          />
        ) : null}
      </main>

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
  );
}

type LaunchGateProps = {
  detail: string;
  isError: boolean;
  isLaunching: boolean;
  onLaunch: () => Promise<void>;
  onOpenInBrowser: () => Promise<void>;
  onRetry: () => Promise<void>;
};

function LaunchGate({
  detail,
  isError,
  isLaunching,
  onLaunch,
  onOpenInBrowser,
  onRetry,
}: LaunchGateProps) {
  return (
    <section className="launch-gate" aria-live="polite">
      <div className="launch-gate__stack">
        <img alt="SoundCloud" className="launch-gate__logo" src={soundCloudLogoWhite} />
        <p className="launch-gate__eyebrow">
          {isError ? "Shell launch failed" : "Local SoundCloud web shell"}
        </p>
        <h1 className="launch-gate__title">
          {isError
            ? "SoundCloud could not load in the desktop shell."
            : "Open SoundCloud inside a cleaner desktop frame."}
        </h1>
        <p className="launch-gate__detail">{detail}</p>

        <div className="launch-gate__actions">
          {isError ? (
            <>
              <button className="button button--primary" onClick={() => void onRetry()} type="button">
                <RefreshCw size={15} />
                Retry inside app
              </button>
              <button
                className="button button--ghost"
                onClick={() => void onOpenInBrowser()}
                type="button"
              >
                <ExternalLink size={15} />
                Open in browser
              </button>
            </>
          ) : (
            <button
              className="button button--primary button--launch"
              disabled={isLaunching}
              onClick={() => void onLaunch()}
              type="button"
            >
              {isLaunching ? <LoaderCircle className="spin" size={15} /> : null}
              {isLaunching ? "Opening SoundCloud" : "Open SoundCloud"}
            </button>
          )}
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

async function waitForShellWebview() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const webview = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (webview) {
      return webview;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }

  return null;
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
