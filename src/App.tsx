import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AudioWaveform,
  ExternalLink,
  Heart,
  Import,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { starterStations } from "./data/catalog";
import "./App.css";
import {
  buildWidgetLoadOptions,
  buildWidgetSrc,
  describeKind,
  fetchSoundCloudOEmbed,
  loadSoundCloudWidgetApi,
  normalizeSoundCloudUrl,
} from "./lib/soundcloud";
import { loadJson, saveJson } from "./lib/storage";
import type {
  AppFeedback,
  AuthLaunch,
  AuthenticatedUser,
  LibraryItem,
  OAuthConfigInput,
  PlaybackSnapshot,
  SoundunCloudSnapshot,
} from "./types";

const STORAGE_KEYS = {
  customItems: "sounduncloud:custom-items",
  favorites: "sounduncloud:favorites",
  recentIds: "sounduncloud:recent-ids",
  searchHistory: "sounduncloud:search-history",
} as const;

const windowHandle = getCurrentWindow();
const initialIframeSrc = buildWidgetSrc(starterStations[0].url);

function App() {
  const [catalog, setCatalog] = useState<LibraryItem[]>(() => [
    ...starterStations,
    ...loadJson<LibraryItem[]>(STORAGE_KEYS.customItems, []),
  ]);
  const [favorites, setFavorites] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.favorites, []),
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.recentIds, []),
  );
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.searchHistory, []),
  );
  const [query, setQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [feedback, setFeedback] = useState<AppFeedback | null>(null);
  const [snapshot, setSnapshot] = useState<SoundunCloudSnapshot | null>(null);
  const [authForm, setAuthForm] = useState<OAuthConfigInput>({
    clientId: "",
    clientSecret: "",
    redirectPort: 8976,
  });
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const [isWidgetApiReady, setIsWidgetApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeId, setActiveId] = useState<string>(
    () => loadJson<string[]>(STORAGE_KEYS.recentIds, [])[0] ?? starterStations[0].id,
  );
  const [playbackSnapshot, setPlaybackSnapshot] = useState<PlaybackSnapshot>({
    title: starterStations[0].title,
    author: starterStations[0].subtitle,
    durationMs: 0,
    positionMs: 0,
  });

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<SoundCloudWidget | null>(null);
  const activeUrlRef = useRef<string>(starterStations[0].url);
  const loadedUrlRef = useRef<string>("");
  const deferredQuery = useDeferredValue(query);

  const activeItem =
    catalog.find((item) => item.id === activeId) ??
    catalog[0] ??
    starterStations[0];

  activeUrlRef.current = activeItem.url;

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredCatalog = normalizedQuery
    ? catalog.filter((item) =>
        [item.title, item.subtitle, item.description, item.url, ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : catalog;

  const favoritesSet = new Set(favorites);
  const favoriteItems = catalog.filter((item) => favoritesSet.has(item.id));
  const importedItems = catalog.filter((item) => item.source === "custom");
  const recentItems = recentIds
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is LibraryItem => Boolean(item));

  const playbackOrder =
    filteredCatalog.find((item) => item.id === activeItem.id) !== undefined
      ? filteredCatalog
      : catalog;

  const featuredItem = filteredCatalog[0] ?? activeItem;
  const authenticatedUser = snapshot?.authenticatedUser ?? null;

  useEffect(() => {
    saveJson(
      STORAGE_KEYS.customItems,
      catalog.filter((item) => item.source === "custom"),
    );
  }, [catalog]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.favorites, favorites);
  }, [favorites]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.recentIds, recentIds);
  }, [recentIds]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.searchHistory, searchHistory);
  }, [searchHistory]);

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
          Number.isFinite(current.redirectPort) && current.redirectPort
            ? current.redirectPort
            : extractPortFromRedirectUri(nextSnapshot.redirectUri),
      }));
    } catch {
      setSnapshot(null);
    }
  });

  useEffect(() => {
    let ignore = false;

    void refreshSnapshot();

    void loadSoundCloudWidgetApi()
      .then(() => {
        if (!ignore) {
          setIsWidgetApiReady(true);
        }
      })
      .catch(() => {
        if (!ignore) {
          setFeedback({
            tone: "error",
            message:
              "SoundunCloud could not load the SoundCloud widget script. Browser playback is still available.",
          });
        }
      });

    void windowHandle
      .isMaximized()
      .then((value) => {
        if (!ignore) {
          setIsMaximized(value);
        }
      })
      .catch(() => undefined);

    const unlistenSuccess = windowHandle.listen<AuthenticatedUser>(
      "sounduncloud://auth-success",
      (event) => {
        if (ignore) {
          return;
        }

        setIsAuthorizing(false);
        setFeedback({
          tone: "success",
          message: `Signed in as ${event.payload.username}. SoundunCloud attached the session securely to this desktop app.`,
        });
        void refreshSnapshot();
      },
    );

    const unlistenError = windowHandle.listen<string>(
      "sounduncloud://auth-error",
      (event) => {
        if (ignore) {
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
      ignore = true;
      void unlistenSuccess.then((stop) => stop());
      void unlistenError.then((stop) => stop());
    };
  }, [refreshSnapshot]);

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
        title: sound.title ?? activeItem.title,
        author: sound.user?.username ?? activeItem.subtitle,
        artworkUrl: sound.artwork_url ?? activeItem.thumbnailUrl,
      }));
    });

    widgetRef.current.getDuration((duration) => {
      setPlaybackSnapshot((current) => ({
        ...current,
        durationMs: duration ?? current.durationMs,
      }));
    });
  });

  useEffect(() => {
    if (!isWidgetApiReady || !iframeRef.current || widgetRef.current) {
      return;
    }

    const widget = window.SC.Widget(iframeRef.current);
    widgetRef.current = widget;

    widget.bind(window.SC.Widget.Events.READY, () => {
      loadedUrlRef.current = activeUrlRef.current;
      setIsWidgetReady(true);
      syncCurrentSound();
    });

    widget.bind(window.SC.Widget.Events.PLAY, () => {
      setIsPlaying(true);
      syncCurrentSound();
    });

    widget.bind(window.SC.Widget.Events.PAUSE, () => {
      setIsPlaying(false);
    });

    widget.bind(window.SC.Widget.Events.FINISH, () => {
      setIsPlaying(false);
    });

    widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (payload) => {
      setPlaybackSnapshot((current) => ({
        ...current,
        positionMs: payload.currentPosition,
        durationMs:
          payload.currentPosition > current.durationMs
            ? payload.currentPosition
            : current.durationMs,
      }));
    });
  }, [isWidgetApiReady, syncCurrentSound]);

  useEffect(() => {
    if (!isWidgetReady || !widgetRef.current) {
      return;
    }

    if (loadedUrlRef.current === activeItem.url) {
      syncCurrentSound();
      return;
    }

    loadedUrlRef.current = activeItem.url;
    setPlaybackSnapshot((current) => ({
      ...current,
      title: activeItem.title,
      author: activeItem.subtitle,
      artworkUrl: activeItem.thumbnailUrl,
      positionMs: 0,
      durationMs: current.durationMs,
    }));

    widgetRef.current.load(activeItem.url, buildWidgetLoadOptions(true));
  }, [activeItem, isWidgetReady, syncCurrentSound]);

  const rememberRecentSearch = (term: string) => {
    if (!term.trim()) {
      return;
    }

    setSearchHistory((current) => [
      term,
      ...current.filter((value) => value.toLowerCase() !== term.toLowerCase()),
    ].slice(0, 6));
  };

  const selectItem = (item: LibraryItem) => {
    setActiveId(item.id);
    setRecentIds((current) => [
      item.id,
      ...current.filter((value) => value !== item.id),
    ].slice(0, 10));
    setFeedback(null);

    if (query.trim()) {
      rememberRecentSearch(query.trim());
    }
  };

  const toggleFavorite = (itemId: string) => {
    setFavorites((current) =>
      current.includes(itemId)
        ? current.filter((value) => value !== itemId)
        : [itemId, ...current],
    );
  };

  const playAdjacent = (direction: -1 | 1) => {
    if (!playbackOrder.length) {
      return;
    }

    const currentIndex = playbackOrder.findIndex((item) => item.id === activeItem.id);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      (safeIndex + direction + playbackOrder.length) % playbackOrder.length;
    selectItem(playbackOrder[nextIndex]);
  };

  const handlePlayPause = () => {
    if (!widgetRef.current) {
      return;
    }

    if (isPlaying) {
      widgetRef.current.pause();
      return;
    }

    widgetRef.current.play();
  };

  const handleAddUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    let normalizedUrl = "";

    try {
      normalizedUrl = normalizeSoundCloudUrl(urlInput);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Paste a valid public SoundCloud URL.",
      });
      return;
    }

    const existingItem = catalog.find((item) => item.url === normalizedUrl);
    if (existingItem) {
      selectItem(existingItem);
      setUrlInput("");
      setFeedback({
        tone: "info",
        message:
          "That SoundCloud page is already in your library, so SoundunCloud queued it up instead of duplicating it.",
      });
      return;
    }

    setIsAddingUrl(true);

    try {
      const metadata = await fetchSoundCloudOEmbed(normalizedUrl);
      const importedItem: LibraryItem = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
        title: metadata.title,
        subtitle: metadata.authorName,
        description: `Imported ${describeKind(metadata.kind)} from SoundCloud.`,
        kind: metadata.kind,
        source: "custom",
        tags: ["Imported", metadata.kind, metadata.authorName, "SoundCloud"],
        thumbnailUrl: metadata.thumbnailUrl,
        tone: metadata.tone,
        url: normalizedUrl,
      };

      setCatalog((current) => [importedItem, ...current]);
      selectItem(importedItem);
      setUrlInput("");
      setFeedback({
        tone: "success",
        message: `${metadata.title} is now in your local library.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "SoundunCloud could not import that SoundCloud URL.",
      });
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleOpenSearch = async (term: string) => {
    const nextTerm = term.trim() || query.trim();
    if (!nextTerm) {
      return;
    }

    rememberRecentSearch(nextTerm);
    await openUrl(
      `https://soundcloud.com/search?q=${encodeURIComponent(nextTerm)}`,
    );
  };

  const handleToggleMaximize = async () => {
    const maximized = await windowHandle.isMaximized();

    if (maximized) {
      await windowHandle.unmaximize();
      setIsMaximized(false);
      return;
    }

    await windowHandle.maximize();
    setIsMaximized(true);
  };

  const handleSaveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingConfig(true);
    setFeedback(null);

    try {
      await invoke("save_oauth_config", {
        input: {
          clientId: authForm.clientId,
          clientSecret: authForm.clientSecret,
          redirectPort: authForm.redirectPort || 8976,
        },
      });

      setFeedback({
        tone: "success",
        message:
          "Desktop OAuth settings saved. The client secret is now stored in secure local storage, not plaintext app files.",
      });
      await refreshSnapshot();
      setAuthForm((current) => ({ ...current, clientSecret: "" }));
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save your SoundCloud app settings.",
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleBrowserSignIn = async () => {
    setFeedback(null);
    setIsAuthorizing(true);

    try {
      const launch = await invoke<AuthLaunch>("begin_soundcloud_login");
      await openUrl(launch.authorizeUrl);
      setFeedback({
        tone: "info",
        message: `Browser sign-in opened. After SoundCloud redirects back to ${launch.redirectUri}, the app will finish the session.`,
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
    setFeedback({
      tone: "info",
      message: "The local SoundunCloud session has been cleared from this device.",
    });
    await refreshSnapshot();
  };

  return (
    <div className="app-shell">
      <div
        className="titlebar"
        onDoubleClick={() => {
          void handleToggleMaximize();
        }}
      >
        <div className="brand-lockup" data-tauri-drag-region>
          <div className="brand-mark" aria-hidden="true">
            <AudioWaveform size={16} strokeWidth={2.4} />
          </div>
          <div>
            <p className="eyebrow">Unofficial Windows desktop companion</p>
            <h1>SoundunCloud</h1>
          </div>
        </div>

        <div
          className="titlebar-drag"
          data-tauri-drag-region
          onDoubleClick={() => {
            void handleToggleMaximize();
          }}
        >
          <span>Drag window</span>
        </div>

        <label className="search-shell">
          <Search size={16} strokeWidth={2.2} />
          <input
            value={query}
            name="library-search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search your local library"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search starter stations, imported URLs, tags, or artists…"
          />
        </label>

        <div className="window-controls">
          <button
            type="button"
            className="chrome-button"
            aria-label="Minimize window"
            onClick={() => {
              void windowHandle.minimize();
            }}
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            className="chrome-button"
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            onClick={() => {
              void handleToggleMaximize();
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            className="chrome-button chrome-button--danger"
            aria-label="Close window"
            onClick={() => {
              void windowHandle.close();
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="workspace">
        <aside className="sidebar panel">
          <nav className="nav-list" aria-label="Primary navigation">
            <NavPill
              icon={<Sparkles size={16} />}
              label="Home feed"
              isActive
              onSelect={() => jumpToSection("home-feed")}
            />
            <NavPill
              icon={<LibraryBig size={16} />}
              label="Library"
              onSelect={() => jumpToSection("library-section")}
            />
            <NavPill
              icon={<LockKeyhole size={16} />}
              label="Auth"
              onSelect={() => jumpToSection("auth-section")}
            />
            <NavPill
              icon={<Settings2 size={16} />}
              label="Settings"
              onSelect={() => jumpToSection("settings-section")}
            />
          </nav>

          <div className="sidebar-group" id="auth-section">
            <SectionTitle icon={<UserRound size={16} />} title="Account" />
            {authenticatedUser ? (
              <div className="account-card">
                <div className="account-header">
                  <span className="cover cover-sky">
                    {authenticatedUser.avatarUrl ? (
                      <img src={authenticatedUser.avatarUrl} alt="" />
                    ) : (
                      <UserRound size={18} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {authenticatedUser.fullName || authenticatedUser.username}
                    </strong>
                    <small>@{authenticatedUser.username}</small>
                  </div>
                </div>
                <p className="support-copy">
                  Browser OAuth is configured and this desktop build has an active,
                  securely stored SoundCloud session.
                </p>
                <div className="stacked-actions">
                  {authenticatedUser.permalinkUrl ? (
                    <button
                      type="button"
                      className="ghost-button ghost-button--full"
                      onClick={() => {
                        void openUrl(authenticatedUser.permalinkUrl!);
                      }}
                    >
                      <ExternalLink size={16} />
                      Open SoundCloud profile
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-button ghost-button--full"
                    onClick={() => {
                      void handleSignOut();
                    }}
                  >
                    <LockKeyhole size={16} />
                    Clear local session
                  </button>
                </div>
              </div>
            ) : (
              <div className="account-card">
                <p className="support-copy">
                  SoundunCloud uses browser-based OAuth 2.1 with PKCE. Save your
                  approved SoundCloud app credentials below, then sign in through
                  the browser. Secrets stay in secure local storage.
                </p>
                <div className="desktop-badges">
                  <Badge text={snapshot?.oauthConfigured ? "OAuth ready" : "Needs client setup"} />
                  <Badge text={snapshot?.redirectUri ?? "http://127.0.0.1:8976/callback"} />
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <SectionTitle icon={<ShieldCheck size={16} />} title="Desktop OAuth" />
            <form className="auth-form" onSubmit={handleSaveConfig}>
              <label>
                <span>Client ID</span>
                <input
                  value={authForm.clientId}
                  name="client-id"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      clientId: event.currentTarget.value,
                    }))
                  }
                  placeholder="SoundCloud client_id"
                />
              </label>
              <label>
                <span>Client secret</span>
                <input
                  type="password"
                  value={authForm.clientSecret}
                  name="client-secret"
                  autoComplete="new-password"
                  spellCheck={false}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      clientSecret: event.currentTarget.value,
                    }))
                  }
                  placeholder="SoundCloud client_secret"
                />
              </label>
              <label>
                <span>Redirect port</span>
                <input
                  type="number"
                  name="redirect-port"
                  min={1024}
                  max={65535}
                  value={authForm.redirectPort}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      redirectPort: Number(event.currentTarget.value) || 8976,
                    }))
                  }
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSavingConfig}>
                {isSavingConfig ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
                Save secure OAuth settings
              </button>
            </form>
            <button
              type="button"
              className="ghost-button ghost-button--full"
              onClick={() => {
                void handleBrowserSignIn();
              }}
              disabled={!snapshot?.oauthConfigured || isAuthorizing}
            >
              {isAuthorizing ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <LockKeyhole size={16} />
              )}
              Sign in with SoundCloud
            </button>
            <div className="desktop-badges">
              <Badge text={snapshot?.configSource ?? "missing"} />
              <Badge text={snapshot?.desktopContext.platformLabel ?? "windows desktop"} />
            </div>
          </div>

          <div className="sidebar-group sidebar-group--bottom" id="library-section">
            <SectionTitle icon={<Heart size={16} />} title="Pinned library" />
            <ul className="compact-list">
              {favoriteItems.length ? (
                favoriteItems.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="compact-row"
                      onClick={() => selectItem(item)}
                    >
                      <span className={`tone-dot tone-${item.tone}`} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="support-copy">
                  Heart any tile to pin it here for your next session.
                </li>
              )}
            </ul>
          </div>
        </aside>

        <main className="content">
          <section className={`hero panel hero-${featuredItem.tone}`} id="home-feed">
            <div className="hero-copy">
              <p className="eyebrow">Editorial desktop shell, browser-native auth</p>
              <h2>
                A quieter SoundCloud desktop.
                <span> More precise hierarchy, calmer navigation, real browser sign-in.</span>
              </h2>
              <p className="hero-summary">
                SoundunCloud keeps the shell lightweight while giving the interface
                more breathing room. Import public tracks or profiles, browse a more
                focused desktop layout, and attach an authenticated account through
                your browser.
              </p>

              <div className="hero-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    void handleBrowserSignIn();
                  }}
                  disabled={!snapshot?.oauthConfigured || isAuthorizing}
                >
                  {isAuthorizing ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <LockKeyhole size={16} />
                  )}
                  Connect account
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    void openUrl("https://developers.soundcloud.com/docs/api/guide#authentication");
                  }}
                >
                  <ExternalLink size={16} />
                  Review auth docs
                </button>
              </div>

              <form className="import-form" onSubmit={handleAddUrl}>
                <label className="import-input">
                  <Import size={16} strokeWidth={2.2} />
                  <input
                    value={urlInput}
                    name="soundcloud-url"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Paste a SoundCloud URL"
                    onChange={(event) => setUrlInput(event.currentTarget.value)}
                    placeholder="Paste any public SoundCloud track, playlist, or profile URL…"
                  />
                </label>
                <button type="submit" className="cta-button" disabled={isAddingUrl}>
                  {isAddingUrl ? "Importing…" : "Import URL"}
                </button>
              </form>

              {feedback ? (
                <p
                  className={`feedback feedback-${feedback.tone}`}
                  role={feedback.tone === "error" ? "alert" : "status"}
                  aria-live={feedback.tone === "error" ? "assertive" : "polite"}
                >
                  {feedback.message}
                </p>
              ) : null}
            </div>

            <div className="hero-panel">
              <div className="hero-current">
                <p className="eyebrow">Listening cue</p>
                <h3>{featuredItem.title}</h3>
                <p>{featuredItem.description}</p>
              </div>
              <ul className="check-list">
                <li>Register a SoundCloud app and add the redirect URI shown in-app.</li>
                <li>Save `client_id` and `client_secret` so SoundunCloud can store them securely.</li>
                <li>Use the browser-based sign-in button to attach the desktop session.</li>
              </ul>
            </div>
          </section>

          <section className="section-block">
            <SectionTitle
              icon={<Sparkles size={16} />}
              title={normalizedQuery ? "Matching your query" : "Home feed"}
              actionLabel={normalizedQuery ? "Clear search" : "Search all"}
              onAction={() => {
                if (normalizedQuery) {
                  setQuery("");
                  return;
                }

                void handleOpenSearch(query);
              }}
            />

            {filteredCatalog.length ? (
              <div className="station-grid">
                {filteredCatalog.map((item) => (
                  <StationCard
                    key={item.id}
                    item={item}
                    isActive={item.id === activeItem.id}
                    isFavorite={favoritesSet.has(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    onSelect={() => selectItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-panel">
                <h3>Nothing matched that search.</h3>
                <p className="support-copy">
                  Try a different artist, tag, or mood, or search directly on SoundCloud.
                </p>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    void handleOpenSearch(query);
                  }}
                >
                  <ExternalLink size={16} />
                  Search on SoundCloud
                </button>
              </div>
            )}
          </section>

          <section className="bottom-grid">
            <div className="panel">
              <SectionTitle icon={<LibraryBig size={16} />} title="Imported URLs" />
              {importedItems.length ? (
                <ul className="library-list">
                  {importedItems.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="library-row"
                        onClick={() => selectItem(item)}
                      >
                        <span className={`cover cover-${item.tone}`}>
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt="" />
                          ) : (
                            <AudioWaveform size={18} />
                          )}
                        </span>
                        <span className="library-row-copy">
                          <strong>{item.title}</strong>
                          <small>
                            {item.subtitle} · {describeKind(item.kind)}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="support-copy">
                  Imported SoundCloud links live here for one-click replay.
                </p>
              )}
            </div>

            <div className="panel">
              <SectionTitle icon={<AudioWaveform size={16} />} title="Recent plays" />
              {recentItems.length ? (
                <ul className="library-list">
                  {recentItems.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="library-row"
                        onClick={() => selectItem(item)}
                      >
                        <span className={`cover cover-${item.tone}`}>
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt="" />
                          ) : (
                            <Play size={18} fill="currentColor" />
                          )}
                        </span>
                        <span className="library-row-copy">
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="support-copy">
                  Your local history stays on-device so you can pick up quickly.
                </p>
              )}
            </div>
          </section>
        </main>

        <aside className="player-column panel">
          <div className="now-playing-card">
            <div className={`art-shell cover-${activeItem.tone}`}>
              {playbackSnapshot.artworkUrl ?? activeItem.thumbnailUrl ? (
                <img
                  src={playbackSnapshot.artworkUrl ?? activeItem.thumbnailUrl}
                  alt=""
                />
              ) : (
                <AudioWaveform size={34} />
              )}
            </div>

            <div className="now-playing-copy">
              <p className="eyebrow">Now playing</p>
              <h3>{playbackSnapshot.title}</h3>
              <p>{playbackSnapshot.author ?? activeItem.subtitle}</p>
            </div>

            <div className="transport">
              <button
                type="button"
                className="transport-button"
                aria-label="Previous station"
                onClick={() => playAdjacent(-1)}
              >
                <SkipBack size={18} />
              </button>
              <button
                type="button"
                className="transport-button transport-button--primary"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                className="transport-button"
                aria-label="Next station"
                onClick={() => playAdjacent(1)}
              >
                <SkipForward size={18} />
              </button>
              <button
                type="button"
                className={`transport-button ${
                  favoritesSet.has(activeItem.id) ? "transport-button--saved" : ""
                }`}
                aria-pressed={favoritesSet.has(activeItem.id)}
                aria-label={
                  favoritesSet.has(activeItem.id)
                    ? "Remove from favorites"
                    : "Add to favorites"
                }
                onClick={() => toggleFavorite(activeItem.id)}
              >
                <Heart
                  size={18}
                  fill={favoritesSet.has(activeItem.id) ? "currentColor" : "none"}
                />
              </button>
            </div>

            <div
              className="progress-shell"
              role="progressbar"
              aria-label="Playback progress"
              aria-valuemin={0}
              aria-valuemax={playbackSnapshot.durationMs || 1}
              aria-valuenow={playbackSnapshot.positionMs}
            >
              <div
                className="progress-value"
                style={{
                  width: `${
                    playbackSnapshot.durationMs
                      ? Math.min(
                          100,
                          (playbackSnapshot.positionMs / playbackSnapshot.durationMs) *
                            100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="progress-meta">
              <span>{formatDuration(playbackSnapshot.positionMs)}</span>
              <span>{formatDuration(playbackSnapshot.durationMs)}</span>
            </div>
          </div>

          <div className="widget-shell">
            <iframe
              ref={iframeRef}
              title="SoundCloud player"
              allow="autoplay"
              className="soundcloud-frame"
              src={initialIframeSrc}
            />
          </div>

          <div className="player-footer" id="settings-section">
            <button
              type="button"
              className="ghost-button ghost-button--full"
              onClick={() => {
                void openUrl(activeItem.url);
              }}
            >
              <ExternalLink size={16} />
              Open current page in browser
            </button>
            <div className="tip-card">
              <p className="eyebrow">Build profile</p>
              <p>
                {snapshot?.desktopContext.version ?? "0.1.0"} ·{" "}
                {snapshot?.desktopContext.platformLabel ?? "desktop"} ·{" "}
                {snapshot?.desktopContext.buildProfile ?? "release"}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NavPill({
  icon,
  label,
  isActive = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-pill ${isActive ? "nav-pill--active" : ""}`}
      aria-pressed={isActive}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="badge">{text}</span>;
}

function SectionTitle({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <div className="section-title-copy">
        {icon}
        <h3>{title}</h3>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="text-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function StationCard({
  item,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  item: LibraryItem;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <article className={`station-card panel ${isActive ? "station-card--active" : ""}`}>
      <button type="button" className="station-hitbox" onClick={onSelect}>
        <div className={`station-cover cover-${item.tone}`}>
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" />
          ) : (
            <AudioWaveform size={24} />
          )}
        </div>
        <div className="station-copy">
          <p className="eyebrow">
            {item.source === "custom" ? "Imported" : "Starter"} · {describeKind(item.kind)}
          </p>
          <h4>{item.title}</h4>
          <p>{item.description}</p>
        </div>
        <div className="station-footer">
          <span>{item.subtitle}</span>
          <div className="station-tags">
            {item.tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </button>
      <button
        type="button"
        className={`favorite-button ${isFavorite ? "favorite-button--active" : ""}`}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        onClick={onToggleFavorite}
      >
        <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

function formatDuration(value: number) {
  if (!value) {
    return "--:--";
  }

  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function extractPortFromRedirectUri(redirectUri: string) {
  try {
    return Number(new URL(redirectUri).port) || 8976;
  } catch {
    return 8976;
  }
}

function jumpToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default App;
