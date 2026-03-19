import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  AudioLines,
  Disc3,
  Home,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  UserRound,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { starterStations } from "../data/catalog";
import {
  buildWidgetLoadOptions,
  buildWidgetSrc,
  loadSoundCloudWidgetApi,
} from "../lib/soundcloud";
import { loadJson, saveJson } from "../lib/storage";
import type {
  AppFeedback,
  AuthLaunch,
  OAuthConfigInput,
  PersonalizedHome,
  PlaybackSnapshot,
  SoundCloudPlaylist,
  SoundCloudTrack,
  SoundunCloudSnapshot,
} from "../types";

const windowHandle = getCurrentWindow();

const STORAGE_KEYS = {
  recentTrackUrns: "sounduncloud:recent-track-urns",
} as const;

type ResourceKind = "track" | "playlist" | "profile";
type ResourceSource = "feed" | "liked" | "recent" | "playlist" | "starter";

type HomeResource = {
  id: string;
  urn?: string;
  title: string;
  subtitle: string;
  caption: string;
  url: string;
  artworkUrl?: string | null;
  badges: string[];
  kind: ResourceKind;
  source: ResourceSource;
};

const initialPlaybackSnapshot: PlaybackSnapshot = {
  title: "SoundunCloud",
  author: "Sign in to listen",
  durationMs: 0,
  positionMs: 0,
};

function AppRoot() {
  const [snapshot, setSnapshot] = useState<SoundunCloudSnapshot | null>(null);
  const [home, setHome] = useState<PersonalizedHome | null>(null);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<AppFeedback | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isLoadingHome, setIsLoadingHome] = useState(false);
  const [isWidgetApiReady, setIsWidgetApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [authForm, setAuthForm] = useState<OAuthConfigInput>({
    clientId: "",
    clientSecret: "",
    redirectPort: 8976,
  });
  const [playbackSnapshot, setPlaybackSnapshot] = useState<PlaybackSnapshot>(
    initialPlaybackSnapshot,
  );
  const [recentTrackUrns, setRecentTrackUrns] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.recentTrackUrns, []),
  );
  const [selectedResource, setSelectedResource] = useState<HomeResource>(() =>
    starterStationToResource(starterStations[0]),
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<SoundCloudWidget | null>(null);
  const widgetBoundRef = useRef(false);
  const loadedUrlRef = useRef("");
  const activeUrnRef = useRef<string | undefined>(selectedResource.urn);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const refreshSnapshot = useEffectEvent(async () => {
    try {
      const nextSnapshot = await invoke<SoundunCloudSnapshot>(
        "load_sounduncloud_snapshot",
      );
      setSnapshot(nextSnapshot);
      setAuthForm((current) => ({
        clientId: current.clientId || nextSnapshot.storedClientId || "",
        clientSecret: current.clientSecret,
        redirectPort:
          current.redirectPort || extractPortFromRedirectUri(nextSnapshot.redirectUri),
      }));
      if (!nextSnapshot.hasLocalSession) {
        setHome(null);
      }
    } catch {
      setSnapshot(null);
      setHome(null);
    }
  });

  const syncCurrentSound = useEffectEvent(() => {
    if (!widgetRef.current) {
      return;
    }

    widgetRef.current.getCurrentSound((sound) => {
      if (!sound) {
        return;
      }

      setPlaybackSnapshot((current) => ({
        ...current,
        title: sound.title || current.title,
        author: sound.user?.username || current.author,
        artworkUrl: sound.artwork_url || current.artworkUrl,
        urn: activeUrnRef.current,
      }));
    });

    widgetRef.current.getDuration((duration) => {
      setPlaybackSnapshot((current) => ({
        ...current,
        durationMs: duration || current.durationMs,
      }));
    });
  });

  const refreshHome = useEffectEvent(async () => {
    if (!snapshot?.hasLocalSession) {
      setHome(null);
      setIsLoadingHome(false);
      return;
    }

    setIsLoadingHome(true);

    try {
      const nextHome = await invoke<PersonalizedHome>("load_personalized_home", {
        recentTrackUrns,
      });
      setHome(nextHome);

      if (
        selectedResource.source === "starter" &&
        nextHome.featuredTrack
      ) {
        setSelectedResource(trackToResource(nextHome.featuredTrack, "feed"));
      }
    } catch (error) {
      setHome(null);
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "SoundunCloud could not load your personalized home right now.",
      });
    } finally {
      setIsLoadingHome(false);
    }
  });

  useEffect(() => {
    void refreshSnapshot();

    let cancelled = false;

    void loadSoundCloudWidgetApi()
      .then(() => {
        if (!cancelled) {
          setIsWidgetApiReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message:
              "The SoundCloud player bridge did not load. Try relaunching the app.",
          });
        }
      });

    void windowHandle.isMaximized().then((value) => {
      if (!cancelled) {
        setIsMaximized(value);
      }
    });

    const unlistenSuccess = windowHandle.listen("sounduncloud://auth-success", () => {
      if (cancelled) {
        return;
      }

      setIsAuthorizing(false);
      setFeedback({
        tone: "success",
        message: "Signed in with SoundCloud. Your home is ready.",
      });
      void refreshSnapshot();
    });

    const unlistenError = windowHandle.listen<string>(
      "sounduncloud://auth-error",
      (event) => {
        if (cancelled) {
          return;
        }

        setIsAuthorizing(false);
        setFeedback({
          tone: "error",
          message: event.payload,
        });
      },
    );

    return () => {
      cancelled = true;
      void unlistenSuccess.then((stop) => stop());
      void unlistenError.then((stop) => stop());
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.recentTrackUrns, recentTrackUrns);
  }, [recentTrackUrns]);

  useEffect(() => {
    if (!snapshot?.hasLocalSession) {
      return;
    }

    void refreshHome();
  }, [recentTrackUrns, refreshHome, snapshot?.hasLocalSession]);

  useEffect(() => {
    if (!isWidgetApiReady || !iframeRef.current || widgetRef.current) {
      return;
    }

    widgetRef.current = window.SC.Widget(iframeRef.current);

    if (widgetBoundRef.current) {
      return;
    }

    widgetBoundRef.current = true;

    widgetRef.current.bind(window.SC.Widget.Events.READY, () => {
      syncCurrentSound();
    });

    widgetRef.current.bind(window.SC.Widget.Events.PLAY, () => {
      setIsPlaying(true);
      syncCurrentSound();

      if (!activeUrnRef.current) {
        return;
      }

      setRecentTrackUrns((current) => {
        const next = [activeUrnRef.current!, ...current.filter((urn) => urn !== activeUrnRef.current)];
        return next.slice(0, 16);
      });
    });

    widgetRef.current.bind(window.SC.Widget.Events.PAUSE, () => {
      setIsPlaying(false);
      syncCurrentSound();
    });

    widgetRef.current.bind(
      window.SC.Widget.Events.PLAY_PROGRESS,
      (payload: { currentPosition: number }) => {
        setPlaybackSnapshot((current) => ({
          ...current,
          positionMs: payload.currentPosition,
          urn: activeUrnRef.current,
        }));
      },
    );

    widgetRef.current.bind(window.SC.Widget.Events.FINISH, () => {
      setIsPlaying(false);
      playAdjacent(1);
    });
  }, [isWidgetApiReady, syncCurrentSound]);

  useEffect(() => {
    activeUrnRef.current = selectedResource.urn;

    if (!widgetRef.current || !selectedResource.url) {
      return;
    }

    if (loadedUrlRef.current === selectedResource.url) {
      widgetRef.current.play();
      return;
    }

    loadedUrlRef.current = selectedResource.url;
    widgetRef.current.load(selectedResource.url, buildWidgetLoadOptions(true));
    setPlaybackSnapshot((current) => ({
      ...current,
      title: selectedResource.title,
      author: selectedResource.subtitle,
      artworkUrl: selectedResource.artworkUrl ?? current.artworkUrl,
      positionMs: 0,
      durationMs: current.durationMs,
      urn: selectedResource.urn,
    }));
  }, [selectedResource]);

  const starterResources = starterStations.map(starterStationToResource);
  const featuredTrack = home?.featuredTrack ?? null;
  const feedTracks = dedupeTracks(home?.feedTracks ?? []);
  const likedTracks = dedupeTracks(home?.likedTracks ?? []);
  const recentTracks = dedupeTracks(home?.recentTracks ?? []);
  const playlists = home?.playlists ?? [];
  const playbackQueue = dedupeTracks([...recentTracks, ...feedTracks, ...likedTracks]);
  const searchMatcher = buildMatcher(deferredQuery);
  const filteredFeaturedTrack =
    featuredTrack && searchMatcher([featuredTrack.title, featuredTrack.user?.username ?? ""])
      ? featuredTrack
      : !deferredQuery
        ? featuredTrack
        : null;

  const filteredFeedResources = feedTracks
    .filter((track) =>
      searchMatcher([track.title, track.user?.username ?? "", "feed"]),
    )
    .map((track) => trackToResource(track, "feed"));

  const filteredLikedResources = likedTracks
    .filter((track) =>
      searchMatcher([track.title, track.user?.username ?? "", "liked"]),
    )
    .map((track) => trackToResource(track, "liked"));

  const filteredRecentResources = recentTracks
    .filter((track) =>
      searchMatcher([track.title, track.user?.username ?? "", "recent"]),
    )
    .map((track) => trackToResource(track, "recent"));

  const filteredPlaylistResources = playlists
    .filter((playlist) =>
      searchMatcher([playlist.title, playlist.user?.username ?? "", "playlist"]),
    )
    .map(playlistToResource);

  const filteredStarterResources = starterResources.filter((resource) =>
    searchMatcher([resource.title, resource.subtitle, ...resource.badges]),
  );

  const emptyHome =
    !isLoadingHome &&
    filteredFeedResources.length === 0 &&
    filteredLikedResources.length === 0 &&
    filteredRecentResources.length === 0 &&
    filteredPlaylistResources.length === 0;

  const viewerName =
    home?.viewer.fullName || home?.viewer.username || "there";

  const handleWindowMinimize = async () => {
    await windowHandle.minimize();
  };

  const handleWindowMaximize = async () => {
    await windowHandle.toggleMaximize();
    setIsMaximized(await windowHandle.isMaximized());
  };

  const handleWindowClose = async () => {
    await windowHandle.close();
  };

  const handleAuthChange =
    (field: keyof OAuthConfigInput) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value =
        field === "redirectPort" ? Number(event.target.value) || 8976 : event.target.value;

      setAuthForm((current) => ({
        ...current,
        [field]: value,
      }));
    };

  const handleSaveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingConfig(true);

    try {
      await invoke("save_oauth_config", { input: authForm });
      await refreshSnapshot();
      setShowSetup(false);
      setFeedback({
        tone: "success",
        message: "Developer keys saved. You can sign in with SoundCloud now.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "SoundunCloud could not save the SoundCloud app keys.",
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleBeginLogin = async () => {
    setIsAuthorizing(true);

    try {
      const authLaunch = await invoke<AuthLaunch>("begin_soundcloud_login");
      await openUrl(authLaunch.authorizeUrl);
      setFeedback({
        tone: "info",
        message: "SoundCloud opened in your browser. Finish sign-in there to continue.",
      });
    } catch (error) {
      setIsAuthorizing(false);
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not start the SoundCloud sign-in flow.",
      });
    }
  };

  const handleSignOut = async () => {
    await invoke("clear_local_session");
    setHome(null);
    setQuery("");
    setFeedback({
      tone: "info",
      message: "Signed out of SoundunCloud on this device.",
    });
    await refreshSnapshot();
  };

  const handlePlayResource = (resource: HomeResource) => {
    setSelectedResource(resource);
  };

  const playAdjacent = (direction: -1 | 1) => {
    if (playbackQueue.length === 0 || !selectedResource.urn) {
      return;
    }

    const currentIndex = playbackQueue.findIndex(
      (track) => track.urn === selectedResource.urn,
    );

    if (currentIndex === -1) {
      return;
    }

    const nextTrack =
      playbackQueue[(currentIndex + direction + playbackQueue.length) % playbackQueue.length];

    setSelectedResource(trackToResource(nextTrack, "feed"));
  };

  const handleTogglePlayback = () => {
    if (!widgetRef.current) {
      return;
    }

    if (isPlaying) {
      widgetRef.current.pause();
      return;
    }

    widgetRef.current.play();
  };

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    await openUrl(
      `https://soundcloud.com/search?q=${encodeURIComponent(query.trim())}`,
    );
  };

  if (!snapshot) {
    return (
      <div className="app-state">
        <div className="app-state__mark">
          <AudioLines size={22} />
        </div>
        <p className="app-state__eyebrow">Launching SoundunCloud</p>
        <h1>Preparing your desktop shell.</h1>
      </div>
    );
  }

  const signedIn = snapshot.hasLocalSession;

  return (
    <div className="shell">
      <WindowChrome
        isMaximized={isMaximized}
        onClose={handleWindowClose}
        onMaximize={handleWindowMaximize}
        onMinimize={handleWindowMinimize}
      />

      {feedback ? (
        <p
          className={`feedback feedback--${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.message}
        </p>
      ) : null}

      {!signedIn ? (
        <SignedOutGate
          authForm={authForm}
          isAuthorizing={isAuthorizing}
          isSavingConfig={isSavingConfig}
          onAuthChange={handleAuthChange}
          onBeginLogin={handleBeginLogin}
          onSaveConfig={handleSaveConfig}
          oauthConfigured={snapshot.oauthConfigured}
          redirectUri={snapshot.redirectUri}
          showSetup={showSetup}
          onToggleSetup={() => setShowSetup((current) => !current)}
        />
      ) : (
        <main className="signed-in-shell">
          <aside className="rail panel">
            <button className="rail__brand" type="button">
              <span className="rail__brand-mark">
                <AudioLines size={18} />
              </span>
              <span>
                <strong>SoundunCloud</strong>
                <small>Desktop</small>
              </span>
            </button>

            <nav className="rail__nav" aria-label="Primary">
              <button className="rail__nav-item rail__nav-item--active" type="button">
                <Home size={16} />
                <span>Home</span>
              </button>
              <button
                className="rail__nav-item"
                type="button"
                onClick={() => searchInputRef.current?.focus()}
              >
                <Search size={16} />
                <span>Search</span>
              </button>
              <button
                className="rail__nav-item"
                type="button"
                onClick={() =>
                  home?.viewer.permalinkUrl ? openUrl(home.viewer.permalinkUrl) : undefined
                }
              >
                <UserRound size={16} />
                <span>Profile</span>
              </button>
            </nav>

            <div className="rail__viewer">
              <p className="rail__label">Signed in</p>
              <strong>{viewerName}</strong>
              <span>@{home?.viewer.username}</span>
            </div>

            <button className="rail__signout" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </aside>

          <section className="content">
            <header className="content__header">
              <div>
                <p className="content__eyebrow">Personalized home</p>
                <h1>{buildGreeting(viewerName)}</h1>
              </div>

              <form className="searchbar" onSubmit={handleSearchSubmit} role="search">
                <Search size={18} />
                <input
                  ref={searchInputRef}
                  aria-label="Search your home"
                  placeholder="Search your feed, likes, recents, or jump to SoundCloud"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="searchbar__submit" type="submit">
                  Open web
                </button>
              </form>
            </header>

            <section className="hero panel">
              <div className="hero__copy">
                <p className="content__eyebrow">For this session</p>
                <h2>
                  {filteredFeaturedTrack
                    ? filteredFeaturedTrack.title
                    : "A quieter SoundCloud desktop, built around your account."}
                </h2>
                <p>
                  {filteredFeaturedTrack
                    ? `Start with ${filteredFeaturedTrack.user?.username ?? "your feed"} and keep the rest of the app out of the way.`
                    : "Sign in once, then come back to your own feed, likes, playlists, and recent plays without the browser clutter."}
                </p>
                <div className="hero__actions">
                  {filteredFeaturedTrack ? (
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() =>
                        handlePlayResource(trackToResource(filteredFeaturedTrack, "feed"))
                      }
                    >
                      <Play size={16} />
                      Play featured
                    </button>
                  ) : null}
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() =>
                      home?.viewer.permalinkUrl ? openUrl(home.viewer.permalinkUrl) : undefined
                    }
                  >
                    <ArrowUpRight size={16} />
                    Open profile
                  </button>
                </div>
              </div>

              <div className="hero__highlight">
                <Artwork
                  alt={selectedResource.title}
                  className="hero__artwork"
                  src={selectedResource.artworkUrl}
                />
                <div className="hero__meta">
                  <p className="content__eyebrow">Now playing</p>
                  <h3>{playbackSnapshot.title}</h3>
                  <span>{playbackSnapshot.author}</span>
                </div>
              </div>
            </section>

            {isLoadingHome ? (
              <div className="section-empty panel">
                <LoaderCircle className="spin" size={18} />
                <p>Loading your SoundCloud home…</p>
              </div>
            ) : null}

            {!isLoadingHome && emptyHome ? (
              <div className="section-empty panel">
                <p>{deferredQuery ? "No matches in your home yet." : "This account does not have enough data to build a home yet."}</p>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => openUrl("https://soundcloud.com")}
                >
                  <ArrowUpRight size={16} />
                  Open SoundCloud
                </button>
              </div>
            ) : null}

            {filteredRecentResources.length > 0 ? (
              <ResourceShelf
                items={filteredRecentResources}
                title="Recent plays"
                onPlay={handlePlayResource}
              />
            ) : null}

            {filteredLikedResources.length > 0 ? (
              <ResourceShelf
                items={filteredLikedResources}
                title="Liked tracks"
                onPlay={handlePlayResource}
              />
            ) : null}

            {filteredFeedResources.length > 0 ? (
              <ResourceShelf
                items={filteredFeedResources}
                title="From your feed"
                onPlay={handlePlayResource}
              />
            ) : null}

            {filteredPlaylistResources.length > 0 ? (
              <ResourceShelf
                items={filteredPlaylistResources}
                title="Your playlists"
                onPlay={handlePlayResource}
              />
            ) : null}

            {!deferredQuery && emptyHome ? (
              <ResourceShelf
                items={filteredStarterResources}
                title="Starter stations"
                onPlay={handlePlayResource}
              />
            ) : null}
          </section>

          <footer className="player-dock panel">
            <div className="player-dock__now">
              <Artwork
                alt={playbackSnapshot.title}
                className="player-dock__artwork"
                src={playbackSnapshot.artworkUrl}
              />
              <div>
                <strong>{playbackSnapshot.title}</strong>
                <span>{playbackSnapshot.author}</span>
              </div>
            </div>

            <div className="player-dock__transport">
              <button className="player-button" type="button" onClick={() => playAdjacent(-1)}>
                <SkipBack size={16} />
              </button>
              <button className="player-button player-button--primary" type="button" onClick={handleTogglePlayback}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button className="player-button" type="button" onClick={() => playAdjacent(1)}>
                <SkipForward size={16} />
              </button>
            </div>

            <div className="player-dock__meta">
              <span>{formatDuration(playbackSnapshot.positionMs)}</span>
              <div className="player-dock__progress">
                <span
                  style={{
                    width: `${
                      playbackSnapshot.durationMs
                        ? (playbackSnapshot.positionMs / playbackSnapshot.durationMs) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span>{formatDuration(playbackSnapshot.durationMs)}</span>
            </div>
          </footer>

          <iframe
            ref={iframeRef}
            allow="autoplay"
            className="widget-frame"
            src={buildWidgetSrc(selectedResource.url)}
            title="SoundCloud widget"
          />
        </main>
      )}
    </div>
  );
}

type WindowChromeProps = {
  isMaximized: boolean;
  onClose: () => void | Promise<void>;
  onMaximize: () => void | Promise<void>;
  onMinimize: () => void | Promise<void>;
};

function WindowChrome({
  isMaximized,
  onClose,
  onMaximize,
  onMinimize,
}: WindowChromeProps) {
  return (
    <header className="chrome panel">
      <div className="chrome__brand" data-tauri-drag-region="true">
        <span className="chrome__mark">
          <Disc3 size={16} />
        </span>
        <div>
          <strong>SoundunCloud</strong>
          <small>Unofficial SoundCloud desktop</small>
        </div>
      </div>

      <div className="chrome__drag" data-tauri-drag-region="true">
        Drag window
      </div>

      <div className="chrome__actions">
        <button aria-label="Minimize window" className="chrome__button" onClick={onMinimize} type="button">
          <Minimize2 size={14} />
        </button>
        <button aria-label="Maximize window" className="chrome__button" onClick={onMaximize} type="button">
          <Maximize2 size={14} />
          <span className="sr-only">{isMaximized ? "Restore" : "Maximize"}</span>
        </button>
        <button aria-label="Close window" className="chrome__button chrome__button--danger" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </div>
    </header>
  );
}

type SignedOutGateProps = {
  authForm: OAuthConfigInput;
  isAuthorizing: boolean;
  isSavingConfig: boolean;
  oauthConfigured: boolean;
  redirectUri: string;
  showSetup: boolean;
  onAuthChange: (field: keyof OAuthConfigInput) => (event: ChangeEvent<HTMLInputElement>) => void;
  onBeginLogin: () => void | Promise<void>;
  onSaveConfig: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onToggleSetup: () => void;
};

function SignedOutGate({
  authForm,
  isAuthorizing,
  isSavingConfig,
  oauthConfigured,
  redirectUri,
  showSetup,
  onAuthChange,
  onBeginLogin,
  onSaveConfig,
  onToggleSetup,
}: SignedOutGateProps) {
  return (
    <main className="gate">
      <section className="gate__card panel">
        <div className="gate__mark">
          <LockKeyhole size={20} />
        </div>
        <p className="content__eyebrow">SoundCloud account required</p>
        <h1>Sign in before using the desktop app.</h1>
        <p>
          SoundunCloud now opens into a minimal browser-based OAuth gate first. After sign-in,
          the home screen is built from your own feed, likes, playlists, and recent listening.
        </p>

        <button
          className="button button--primary button--wide"
          disabled={!oauthConfigured || isAuthorizing}
          onClick={() => void onBeginLogin()}
          type="button"
        >
          {isAuthorizing ? <LoaderCircle className="spin" size={16} /> : <AudioLines size={16} />}
          {isAuthorizing ? "Waiting for browser sign-in" : "Sign in with SoundCloud"}
        </button>

        <button className="button button--ghost button--wide" onClick={onToggleSetup} type="button">
          {oauthConfigured ? "Edit developer keys" : "Set up developer keys"}
        </button>

        <div className="gate__hint">
          <span>Redirect URI</span>
          <code>{redirectUri}</code>
        </div>

        {showSetup || !oauthConfigured ? (
          <form className="gate__form" onSubmit={(event) => void onSaveConfig(event)}>
            <label>
              <span>Client ID</span>
              <input onChange={onAuthChange("clientId")} value={authForm.clientId} />
            </label>
            <label>
              <span>Client secret</span>
              <input onChange={onAuthChange("clientSecret")} type="password" value={authForm.clientSecret} />
            </label>
            <label>
              <span>Redirect port</span>
              <input min={1024} onChange={onAuthChange("redirectPort")} type="number" value={authForm.redirectPort} />
            </label>
            <button className="button button--primary button--wide" disabled={isSavingConfig} type="submit">
              {isSavingConfig ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
              {isSavingConfig ? "Saving keys" : "Save developer keys"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

type ResourceShelfProps = {
  items: HomeResource[];
  title: string;
  onPlay: (resource: HomeResource) => void;
};

function ResourceShelf({ items, title, onPlay }: ResourceShelfProps) {
  return (
    <section className="shelf">
      <div className="shelf__header">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <div className="shelf__track">
        {items.map((item) => (
          <button
            className="media-card panel"
            key={item.id}
            onClick={() => onPlay(item)}
            type="button"
          >
            <Artwork alt={item.title} className="media-card__artwork" src={item.artworkUrl} />
            <div className="media-card__copy">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <small>{item.caption}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

type ArtworkProps = {
  alt: string;
  className: string;
  src?: string | null;
};

function Artwork({ alt, className, src }: ArtworkProps) {
  if (src) {
    return <img alt={alt} className={className} src={upgradeArtwork(src)} />;
  }

  return (
    <div aria-hidden="true" className={`${className} artwork-fallback`}>
      <AudioLines size={18} />
    </div>
  );
}

export default AppRoot;

function trackToResource(track: SoundCloudTrack, source: ResourceSource): HomeResource {
  return {
    id: `${source}-${track.urn}`,
    urn: track.urn,
    title: track.title,
    subtitle: track.user?.username ?? "SoundCloud",
    caption:
      source === "recent"
        ? "Played in this desktop app"
        : source === "liked"
          ? `${formatCompact(track.playbackCount)} plays`
          : "From your SoundCloud feed",
    url: track.permalinkUrl,
    artworkUrl: track.artworkUrl,
    badges: [source],
    kind: "track",
    source,
  };
}

function playlistToResource(playlist: SoundCloudPlaylist): HomeResource {
  return {
    id: `playlist-${playlist.urn}`,
    urn: playlist.urn,
    title: playlist.title,
    subtitle: playlist.user?.username ?? "SoundCloud",
    caption: `${formatCompact(playlist.trackCount)} tracks`,
    url: playlist.permalinkUrl,
    artworkUrl: playlist.artworkUrl,
    badges: ["playlist"],
    kind: "playlist",
    source: "playlist",
  };
}

function starterStationToResource(station: (typeof starterStations)[number]): HomeResource {
  return {
    id: station.id,
    title: station.title,
    subtitle: station.subtitle,
    caption: station.description,
    url: station.url,
    artworkUrl: station.thumbnailUrl,
    badges: station.tags,
    kind: station.kind,
    source: "starter",
  };
}

function dedupeTracks(tracks: SoundCloudTrack[]) {
  return Array.from(new Map(tracks.map((track) => [track.urn, track])).values());
}

function buildMatcher(query: string) {
  if (!query) {
    return () => true;
  }

  return (parts: string[]) => parts.join(" ").toLowerCase().includes(query);
}

function buildGreeting(name: string) {
  const hour = new Date().getHours();

  if (hour < 12) {
    return `Good morning, ${name}`;
  }

  if (hour < 18) {
    return `Good afternoon, ${name}`;
  }

  return `Good evening, ${name}`;
}

function extractPortFromRedirectUri(redirectUri: string) {
  try {
    return new URL(redirectUri).port
      ? Number(new URL(redirectUri).port)
      : 8976;
  } catch {
    return 8976;
  }
}

function formatDuration(durationMs: number) {
  if (!durationMs) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function upgradeArtwork(url: string) {
  return url.replace("-large.", "-t500x500.");
}
