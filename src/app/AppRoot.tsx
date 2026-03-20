import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import {
  ArrowUpRight,
  LogIn,
  ExternalLink,
  LoaderCircle,
  Minus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";
import { loadJson, saveJson } from "../lib/storage";
import type {
  AppFeedback,
  AuthLaunch,
  PersonalizedHome,
  SoundCloudTrack,
  SoundunCloudSnapshot,
} from "../types";
import { NativeWorkspace, type NativeView } from "./NativeWorkspace";

const windowHandle = getCurrentWebviewWindow();

const AUTH_EVENT_ERROR = "sounduncloud://auth-error";
const AUTH_EVENT_SUCCESS = "sounduncloud://auth-success";
const RECENT_TRACK_URNS_STORAGE_KEY = "sounduncloud.recent-track-urns";
const SOUNDCLOUD_WEBVIEW_LABEL = "soundcloud-shell";
const SOUNDCLOUD_HOME_URL = "https://soundcloud.com/signin";
const SHELL_PADDING = 18;
const SHELL_TOP_INSET = 78;
const SHELL_BOTTOM_INSET = 82;
const MIN_WEBVIEW_HEIGHT = 420;
const MIN_WEBVIEW_WIDTH = 720;

type AvailableUpdate = Exclude<Awaited<ReturnType<typeof check>>, null>;
type ExperienceMode = "booting" | "native" | "native-auth" | "web-shell";
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
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("booting");
  const [nativeView, setNativeView] = useState<NativeView>("home");
  const [shellPhase, setShellPhase] = useState<ShellPhase>("idle");
  const [shellError, setShellError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SoundunCloudSnapshot | null>(null);
  const [home, setHome] = useState<PersonalizedHome | null>(null);
  const [currentTrack, setCurrentTrack] = useState<SoundCloudTrack | null>(null);
  const [nativeFeedback, setNativeFeedback] = useState<AppFeedback | null>(null);
  const [isLoadingNativeHome, setIsLoadingNativeHome] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [recentTrackUrns, setRecentTrackUrns] = useState<string[]>(() =>
    loadJson<string[]>(RECENT_TRACK_URNS_STORAGE_KEY, []),
  );
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateFabState, setUpdateFabState] = useState<UpdateFabState>({
    kind: "idle",
  });

  const isCheckingUpdates = updateFabState.kind === "checking";
  const isInstallingUpdate = updateFabState.kind === "installing";
  const isNativeExperience =
    experienceMode === "booting" ||
    experienceMode === "native" ||
    experienceMode === "native-auth";

  const handleShellPointerDown = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button, input, a, [data-no-drag]")) {
      return;
    }

    void windowHandle.startDragging();
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

  const closeShellWebview = useCallback(async () => {
    const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);
    if (existing) {
      await existing.close();
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    return invoke<SoundunCloudSnapshot>("load_sounduncloud_snapshot");
  }, []);

  const loadNativeHome = useCallback(
    async (nextSnapshot?: SoundunCloudSnapshot | null) => {
      setIsLoadingNativeHome(true);

      try {
        const loadedHome = await invoke<PersonalizedHome>("load_personalized_home", {
          recentTrackUrns,
        });

        await closeShellWebview();
        setSnapshot(nextSnapshot ?? null);
        setHome(loadedHome);
        setNativeView("home");
        setCurrentTrack(
          (current) =>
            current ??
            loadedHome.featuredTrack ??
            loadedHome.feedTracks[0] ??
            loadedHome.likedTracks[0] ??
            loadedHome.recentTracks[0] ??
            null,
        );
        setNativeFeedback(null);
        setExperienceMode("native");
      } catch (error) {
        setNativeFeedback({
          tone: "error",
          message: formatUnknownError(
            error,
            "SoundunCloud could not load the native workspace.",
          ),
        });

        if (nextSnapshot?.oauthConfigured) {
          setExperienceMode("native-auth");
        } else {
          setExperienceMode("web-shell");
          await ensureShellWebview();
        }
      } finally {
        setIsLoadingNativeHome(false);
      }
    },
    [closeShellWebview, ensureShellWebview, recentTrackUrns],
  );

  const bootstrapExperience = useCallback(async () => {
    setExperienceMode("booting");

    try {
      const loadedSnapshot = await loadSnapshot();
      setSnapshot(loadedSnapshot);

      if (loadedSnapshot.oauthConfigured) {
        if (loadedSnapshot.hasLocalSession) {
          await loadNativeHome(loadedSnapshot);
        } else {
          setHome(null);
          setCurrentTrack(null);
          setExperienceMode("native-auth");
        }
        return;
      }
    } catch (error) {
      setNativeFeedback({
        tone: "info",
        message: formatUnknownError(
          error,
          "Native mode is unavailable right now, so SoundunCloud is falling back to the web shell.",
        ),
      });
    }

    setExperienceMode("web-shell");
    await ensureShellWebview();
  }, [ensureShellWebview, loadNativeHome, loadSnapshot]);

  const recreateShellWebview = useCallback(async () => {
    await closeShellWebview();
    await ensureShellWebview();
  }, [closeShellWebview, ensureShellWebview]);

  const rememberTrack = useCallback((track: SoundCloudTrack) => {
    setCurrentTrack(track);
    setRecentTrackUrns((current) => {
      const next = [track.urn, ...current.filter((urn) => urn !== track.urn)].slice(0, 12);
      saveJson(RECENT_TRACK_URNS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const refreshNativeWorkspace = useCallback(async () => {
    try {
      const nextSnapshot = await loadSnapshot();
      setSnapshot(nextSnapshot);

      if (!nextSnapshot.oauthConfigured) {
        setNativeFeedback({
          tone: "info",
          message:
            "Native mode still needs the SoundunCloud auth service. Using the web shell instead.",
        });
        setExperienceMode("web-shell");
        await ensureShellWebview();
        return;
      }

      if (!nextSnapshot.hasLocalSession) {
        setHome(null);
        setCurrentTrack(null);
        setExperienceMode("native-auth");
        return;
      }

      await loadNativeHome(nextSnapshot);
    } catch (error) {
      setNativeFeedback({
        tone: "error",
        message: formatUnknownError(error, "SoundunCloud could not refresh native mode."),
      });
    }
  }, [ensureShellWebview, loadNativeHome, loadSnapshot]);

  const startNativeLogin = useCallback(async () => {
    setIsStartingLogin(true);
    setNativeFeedback({
      tone: "info",
      message: "Opening SoundCloud sign-in in your browser.",
    });

    try {
      const launch = await invoke<AuthLaunch>("begin_soundcloud_login");
      await openUrl(launch.authorizeUrl);
    } catch (error) {
      setIsStartingLogin(false);
      setNativeFeedback({
        tone: "error",
        message: formatUnknownError(
          error,
          "SoundunCloud could not start the SoundCloud sign-in flow.",
        ),
      });
    }
  }, []);

  const handleOpenWebShell = useCallback(async () => {
    setExperienceMode("web-shell");
    await ensureShellWebview();
  }, [ensureShellWebview]);

  const handleSignOut = useCallback(async () => {
    try {
      await invoke("clear_local_session");
      setSnapshot((current) =>
        current
          ? {
              ...current,
              hasLocalSession: false,
              authenticatedUser: null,
            }
          : current,
      );
      setHome(null);
      setCurrentTrack(null);
      setNativeFeedback({
        tone: "info",
        message: "Signed out from native mode on this device.",
      });
      setExperienceMode(snapshot?.oauthConfigured ? "native-auth" : "web-shell");

      if (!snapshot?.oauthConfigured) {
        await ensureShellWebview();
      }
    } catch (error) {
      setNativeFeedback({
        tone: "error",
        message: formatUnknownError(error, "SoundunCloud could not clear the local session."),
      });
    }
  }, [ensureShellWebview, snapshot?.oauthConfigured]);

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
    void bootstrapExperience();

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
  }, [bootstrapExperience, syncShellWebviewBounds]);

  useEffect(() => {
    const successListener = listen(AUTH_EVENT_SUCCESS, async () => {
      setIsStartingLogin(false);
      setNativeFeedback({
        tone: "success",
        message: "Signed in. Loading your SoundCloud workspace.",
      });

      try {
        const nextSnapshot = await loadSnapshot();
        setSnapshot(nextSnapshot);
        await loadNativeHome(nextSnapshot);
      } catch (error) {
        setNativeFeedback({
          tone: "error",
          message: formatUnknownError(
            error,
            "SoundunCloud could not finalize the SoundCloud sign-in flow.",
          ),
        });
        setExperienceMode("native-auth");
      }
    });

    const errorListener = listen<string>(AUTH_EVENT_ERROR, (event) => {
      setIsStartingLogin(false);
      setNativeFeedback({
        tone: "error",
        message:
          typeof event.payload === "string" && event.payload.trim()
            ? event.payload.trim()
            : "SoundCloud sign-in did not finish.",
      });
      setExperienceMode("native-auth");
    });

    return () => {
      void successListener.then((unlisten) => unlisten());
      void errorListener.then((unlisten) => unlisten());
    };
  }, [loadNativeHome, loadSnapshot]);

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
  const updateFabPositionClass = experienceMode === "native" ? "update-fab--raised" : "";

  return (
    <div
      className={
        isNativeExperience
          ? "shell shell--native"
          : `shell ${shellPhase === "ready" ? "shell--active" : ""}`
      }
    >
      <div className="shell__ambient" />

      <div className="window-frame">
        <div className="window-frame__drag-strip" onMouseDown={handleShellPointerDown} />
        <WindowControls />
      </div>

      <main
        className={`shell__stage ${isNativeExperience ? "shell__stage--native" : ""}`}
        onMouseDown={handleShellPointerDown}
      >
        {experienceMode === "booting" ? (
          <StatusGate
            detail="Loading SoundunCloud."
            title="Preparing your desktop workspace."
          />
        ) : null}

        {experienceMode === "native-auth" ? (
          <NativeSetupGate
            feedback={nativeFeedback}
            isConfigured={snapshot?.oauthConfigured ?? false}
            isStartingLogin={isStartingLogin}
            onOpenWebShell={handleOpenWebShell}
            onRefresh={refreshNativeWorkspace}
            onStartLogin={startNativeLogin}
          />
        ) : null}

        {experienceMode === "native" && home ? (
          <NativeWorkspace
            currentTrack={currentTrack}
            feedback={nativeFeedback}
            home={home}
            isLoading={isLoadingNativeHome}
            onOpenWebShell={handleOpenWebShell}
            onRefresh={refreshNativeWorkspace}
            onSelectTrack={rememberTrack}
            onSignOut={handleSignOut}
            onViewChange={setNativeView}
            snapshot={snapshot}
            view={nativeView}
          />
        ) : null}

        {experienceMode === "web-shell" && shellPhase !== "ready" ? (
          <LaunchGate
            detail={
              shellPhase === "error"
                ? shellError ??
                  "SoundunCloud could not launch the embedded SoundCloud shell."
                : "Opening the real SoundCloud site inside the app."
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
        className={`update-fab ${updateFabToneClass} ${updateFabPositionClass}`.trim()}
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
          ) : !isLaunching ? (
            <button
              className="button button--primary button--launch"
              disabled={isLaunching}
              onClick={() => void onLaunch()}
              type="button"
            >
              {isLaunching ? <LoaderCircle className="spin" size={15} /> : null}
              {isLaunching ? "Opening SoundCloud" : "Open SoundCloud"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type NativeSetupGateProps = {
  feedback: AppFeedback | null;
  isConfigured: boolean;
  isStartingLogin: boolean;
  onOpenWebShell: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onStartLogin: () => Promise<void>;
};

function NativeSetupGate({
  feedback,
  isConfigured,
  isStartingLogin,
  onOpenWebShell,
  onRefresh,
  onStartLogin,
}: NativeSetupGateProps) {
  return (
    <section className="status-gate" aria-live="polite">
      <div className="status-gate__panel native-panel">
        <img alt="SoundCloud" className="status-gate__logo" src={soundCloudLogoWhite} />
        <p className="status-gate__eyebrow">Native SoundCloud mode</p>
        <h1 className="status-gate__title">
          {isConfigured
            ? "Connect SoundCloud for the native workspace."
            : "Native mode needs the auth service first."}
        </h1>
        <p className="status-gate__detail">
          {isConfigured
            ? "This turns SoundunCloud into a real custom desktop client with your feed, likes, playlists, and recent tracks."
            : "The current repo can render a custom client, but it still needs `SOUNDUNCLOUD_AUTH_BASE_URL` and the optional auth service configured first."}
        </p>

        {feedback ? (
          <div className={`feedback-banner feedback-banner--${feedback.tone}`}>
            {feedback.message}
          </div>
        ) : null}

        <div className="status-gate__actions">
          {isConfigured ? (
            <button
              className="button button--primary"
              disabled={isStartingLogin}
              onClick={() => void onStartLogin()}
              type="button"
            >
              {isStartingLogin ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />}
              {isStartingLogin ? "Waiting for SoundCloud" : "Connect SoundCloud"}
            </button>
          ) : (
            <button className="button button--ghost" onClick={() => void onRefresh()} type="button">
              <RefreshCw size={15} />
              Recheck native mode
            </button>
          )}
          <button className="button button--ghost" onClick={() => void onOpenWebShell()} type="button">
            <ExternalLink size={15} />
            Use web shell
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusGate({ detail, title }: { detail: string; title: string }) {
  return (
    <section className="status-gate" aria-live="polite">
      <div className="status-gate__panel native-panel">
        <img alt="SoundCloud" className="status-gate__logo" src={soundCloudLogoWhite} />
        <p className="status-gate__eyebrow">SoundunCloud</p>
        <h1 className="status-gate__title">{title}</h1>
        <p className="status-gate__detail">{detail}</p>
        <div className="status-gate__loader">
          <LoaderCircle className="spin" size={18} />
          <span>Loading</span>
        </div>
      </div>
    </section>
  );
}

function WindowControls() {
  const handleMinimize = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void windowHandle.minimize();
  };

  const handleToggleMaximize = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void windowHandle.toggleMaximize();
  };

  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void windowHandle.close();
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
