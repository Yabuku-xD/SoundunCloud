import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { ArrowUpRight, LoaderCircle, Minus, Square, X } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";
import { loadJson, saveJson } from "../lib/storage";
import type {
  AppFeedback,
  PersonalizedHome,
  SoundCloudTrack,
  SoundunCloudSnapshot,
} from "../types";
import { HybridShell, type HybridShellView } from "./HybridShell";
import { NativeWorkspace, type NativeView } from "./NativeWorkspace";

const windowHandle = getCurrentWebviewWindow();

const RECENT_TRACK_URNS_STORAGE_KEY = "sounduncloud.recent-track-urns";
const SOUNDCLOUD_WEBVIEW_LABEL = "soundcloud-shell";
const SOUNDCLOUD_HOME_URL = "https://soundcloud.com/stream";
const SHELL_PADDING = 18;
const SHELL_TOP_INSET = 78;
const SHELL_BOTTOM_INSET = 82;
const MIN_WEBVIEW_HEIGHT = 420;
const MIN_WEBVIEW_WIDTH = 720;

type AvailableUpdate = Exclude<Awaited<ReturnType<typeof check>>, null>;
type ExperienceMode = "booting" | "native" | "hybrid-shell";
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
  const [shellView, setShellView] = useState<HybridShellView>("home");
  const [shellPhase, setShellPhase] = useState<ShellPhase>("idle");
  const [shellError, setShellError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SoundunCloudSnapshot | null>(null);
  const [home, setHome] = useState<PersonalizedHome | null>(null);
  const [currentTrack, setCurrentTrack] = useState<SoundCloudTrack | null>(null);
  const [nativeFeedback, setNativeFeedback] = useState<AppFeedback | null>(null);
  const [isLoadingNativeHome, setIsLoadingNativeHome] = useState(false);
  const [recentTrackUrns, setRecentTrackUrns] = useState<string[]>(() =>
    loadJson<string[]>(RECENT_TRACK_URNS_STORAGE_KEY, []),
  );
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateFabState, setUpdateFabState] = useState<UpdateFabState>({ kind: "idle" });
  const shellViewportRef = useRef<HTMLDivElement | null>(null);

  const isCheckingUpdates = updateFabState.kind === "checking";
  const isInstallingUpdate = updateFabState.kind === "installing";

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

    const viewport = shellViewportRef.current;
    if (experienceMode === "hybrid-shell" && viewport) {
      const rect = viewport.getBoundingClientRect();

      if (rect.width > 48 && rect.height > 48) {
        await Promise.all([
          shellWebview.setPosition(new LogicalPosition(rect.left, rect.top)),
          shellWebview.setSize(new LogicalSize(rect.width, rect.height)),
        ]);
        return;
      }
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
  }, [experienceMode]);

  const ensureShellWebview = useCallback(
    async (target?: string) => {
      setShellPhase("launching");
      setShellError(null);

      try {
        const nextTarget = target ?? getShellViewUrl(shellView);
        const existing = await Webview.getByLabel(SOUNDCLOUD_WEBVIEW_LABEL);

        if (existing) {
          await invoke("navigate_soundcloud_shell", {
            target: nextTarget,
          });
          await syncShellWebviewBounds();
          await existing.show();
          await existing.setFocus();
          setShellPhase("ready");
          return;
        }

        await invoke("launch_soundcloud_shell", {
          target: nextTarget,
        });

        const shellWebview = await waitForShellWebview();
        if (!shellWebview) {
          throw new Error("SoundunCloud created the shell, but it never became addressable.");
        }

        await syncShellWebviewBounds();
        await shellWebview.show();
        await shellWebview.setFocus();
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
    },
    [shellView, syncShellWebviewBounds],
  );

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
          tone: "info",
          message: formatUnknownError(
            error,
            "Native API mode is unavailable right now, so SoundunCloud is using the desktop shell instead.",
          ),
        });
        setExperienceMode("hybrid-shell");
        await ensureShellWebview(getShellViewUrl(shellView));
      } finally {
        setIsLoadingNativeHome(false);
      }
    },
    [closeShellWebview, ensureShellWebview, recentTrackUrns, shellView],
  );

  const bootstrapExperience = useCallback(async () => {
    setExperienceMode("booting");

    try {
      const loadedSnapshot = await loadSnapshot();
      setSnapshot(loadedSnapshot);

      if (loadedSnapshot.oauthConfigured && loadedSnapshot.hasLocalSession) {
        await loadNativeHome(loadedSnapshot);
        return;
      }
    } catch (error) {
      setNativeFeedback({
        tone: "info",
        message: formatUnknownError(
          error,
          "SoundunCloud could not load native API mode, so it is falling back to the desktop shell.",
        ),
      });
    }

    setExperienceMode("hybrid-shell");
    await ensureShellWebview(getShellViewUrl(shellView));
  }, [ensureShellWebview, loadNativeHome, loadSnapshot, shellView]);

  const recreateShellWebview = useCallback(async () => {
    await closeShellWebview();
    await ensureShellWebview(getShellViewUrl(shellView));
  }, [closeShellWebview, ensureShellWebview, shellView]);

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

      if (nextSnapshot.oauthConfigured && nextSnapshot.hasLocalSession) {
        await loadNativeHome(nextSnapshot);
        return;
      }

      setExperienceMode("hybrid-shell");
      await ensureShellWebview(getShellViewUrl(shellView));
    } catch (error) {
      setNativeFeedback({
        tone: "error",
        message: formatUnknownError(
          error,
          "SoundunCloud could not refresh native mode, so the shell stayed on the embedded site.",
        ),
      });
      setExperienceMode("hybrid-shell");
      await ensureShellWebview(getShellViewUrl(shellView));
    }
  }, [ensureShellWebview, loadNativeHome, loadSnapshot, shellView]);

  const handleOpenWebShell = useCallback(async () => {
    setExperienceMode("hybrid-shell");
    await ensureShellWebview(getShellViewUrl(shellView));
  }, [ensureShellWebview, shellView]);

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
        message: "Signed out from native API mode on this device.",
      });
      setExperienceMode("hybrid-shell");
      await ensureShellWebview(getShellViewUrl(shellView));
    } catch (error) {
      setNativeFeedback({
        tone: "error",
        message: formatUnknownError(error, "SoundunCloud could not clear the local session."),
      });
    }
  }, [ensureShellWebview, shellView]);

  const handleShellViewChange = useCallback(
    (nextView: HybridShellView) => {
      setShellView(nextView);
      setNativeFeedback(null);

      if (experienceMode !== "native") {
        setExperienceMode("hybrid-shell");
        void ensureShellWebview(getShellViewUrl(nextView));
      }
    },
    [ensureShellWebview, experienceMode],
  );

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
    await openUrl(getShellViewUrl(shellView));
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
    if (experienceMode !== "hybrid-shell") {
      return;
    }

    const viewport = shellViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      void syncShellWebviewBounds();
      return;
    }

    void syncShellWebviewBounds();

    const observer = new ResizeObserver(() => {
      void syncShellWebviewBounds();
    });
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [experienceMode, syncShellWebviewBounds]);

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
    <div className="shell shell--native">
      <div className="shell__ambient" />

      <div className="window-frame">
        <div className="window-frame__drag-strip" onMouseDown={handleShellPointerDown} />
        <WindowControls />
      </div>

      <main className="shell__stage shell__stage--native" onMouseDown={handleShellPointerDown}>
        {experienceMode === "booting" ? (
          <StatusGate
            detail="Loading SoundunCloud."
            title="Preparing your desktop workspace."
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

        {experienceMode === "hybrid-shell" ? (
          <HybridShell
            feedback={nativeFeedback}
            onOpenInBrowser={handleOpenInBrowser}
            onRefresh={refreshNativeWorkspace}
            onRetry={recreateShellWebview}
            onViewChange={handleShellViewChange}
            shellError={shellError}
            shellPhase={shellPhase}
            snapshot={snapshot}
            view={shellView}
            viewportRef={shellViewportRef}
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

function getShellViewUrl(view: HybridShellView) {
  switch (view) {
    case "likes":
      return "https://soundcloud.com/you/likes";
    case "library":
      return "https://soundcloud.com/you/library";
    case "discover":
      return "https://soundcloud.com/discover";
    default:
      return SOUNDCLOUD_HOME_URL;
  }
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
