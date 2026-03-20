import {
  ArrowUpRight,
  Compass,
  Heart,
  House,
  LibraryBig,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";
import type { AppFeedback, SoundunCloudSnapshot } from "../types";

export type HybridShellView = "home" | "likes" | "library" | "discover";
type ShellPhase = "idle" | "launching" | "ready" | "error";

type Props = {
  feedback: AppFeedback | null;
  onOpenInBrowser: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onRetry: () => Promise<void>;
  onViewChange: (view: HybridShellView) => void;
  shellError: string | null;
  shellPhase: ShellPhase;
  snapshot: SoundunCloudSnapshot | null;
  view: HybridShellView;
  viewportRef: RefObject<HTMLDivElement | null>;
};

export function HybridShell({
  feedback,
  onOpenInBrowser,
  onRefresh,
  onRetry,
  onViewChange,
  shellError,
  shellPhase,
  snapshot,
  view,
  viewportRef,
}: Props) {
  const descriptor = describeView(view);
  const isLoading = shellPhase === "idle" || shellPhase === "launching";

  return (
    <div className="hybrid-shell" data-no-drag>
      <aside className="hybrid-sidebar native-panel">
        <div className="native-brand">
          <img alt="SoundCloud" className="native-brand__logo" src={soundCloudLogoWhite} />
          <div>
            <p className="native-brand__eyebrow">SoundunCloud</p>
            <p className="native-brand__meta">Native desktop shell</p>
          </div>
        </div>

        <nav className="native-nav">
          <NavButton
            active={view === "home"}
            icon={<House size={16} />}
            label="Home"
            onClick={() => onViewChange("home")}
          />
          <NavButton
            active={view === "likes"}
            icon={<Heart size={16} />}
            label="Likes"
            onClick={() => onViewChange("likes")}
          />
          <NavButton
            active={view === "library"}
            icon={<LibraryBig size={16} />}
            label="Library"
            onClick={() => onViewChange("library")}
          />
          <NavButton
            active={view === "discover"}
            icon={<Compass size={16} />}
            label="Discover"
            onClick={() => onViewChange("discover")}
          />
        </nav>

        <div className="hybrid-sidebar__note native-panel native-panel--soft">
          <p className="hybrid-sidebar__title">Why this shows now</p>
          <p className="hybrid-sidebar__copy">
            This shell uses your existing SoundCloud web session, so the app can render a custom
            frame without waiting on the separate auth service.
          </p>
        </div>

        <div className="native-sidebar__spacer" />

        <div className="native-profile native-panel native-panel--soft">
          <div className="native-profile__avatar">
            <span>SC</span>
          </div>
          <div>
            <p className="native-profile__name">
              {snapshot?.desktopContext.appName ?? "SoundunCloud"}
            </p>
            <p className="native-profile__meta">
              {snapshot?.desktopContext.platformLabel ?? "desktop"} · v
              {snapshot?.desktopContext.version ?? "0.0.0"}
            </p>
          </div>
        </div>
      </aside>

      <section className="hybrid-main">
        <header className="hybrid-topbar native-panel">
          <div>
            <p className="native-topbar__eyebrow">Custom SoundCloud frame</p>
            <h1 className="native-topbar__title">{descriptor.title}</h1>
            <p className="hybrid-topbar__copy">{descriptor.detail}</p>
          </div>

          <div className="native-topbar__actions">
            <button className="control-chip" onClick={() => void onRefresh()} type="button">
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              className="control-chip control-chip--accent"
              onClick={() => void onOpenInBrowser()}
              type="button"
            >
              <ArrowUpRight size={14} />
              Open page
            </button>
          </div>
        </header>

        {feedback ? (
          <div className={`feedback-banner feedback-banner--${feedback.tone}`}>{feedback.message}</div>
        ) : null}

        <section className="hybrid-viewport native-panel">
          <div className="hybrid-viewport__frame" ref={viewportRef} />

          {shellPhase !== "ready" ? (
            <div className="hybrid-viewport__overlay">
              <div className="hybrid-viewport__overlay-panel native-panel native-panel--soft">
                <p className="hybrid-sidebar__title">
                  {shellPhase === "error"
                    ? "SoundCloud did not load in the shell."
                    : "Loading SoundCloud in the native frame."}
                </p>
                <p className="hybrid-sidebar__copy">
                  {shellPhase === "error"
                    ? shellError ??
                      "The embedded SoundCloud view failed to start, so the shell is waiting for a retry."
                    : "Opening the logged-in SoundCloud webview inside your custom desktop layout."}
                </p>
                <div className="hybrid-viewport__actions">
                  {shellPhase === "error" ? (
                    <button className="button button--primary" onClick={() => void onRetry()} type="button">
                      <RefreshCw size={15} />
                      Retry
                    </button>
                  ) : (
                    <button className="button button--primary" disabled type="button">
                      <LoaderCircle className="spin" size={15} />
                      Opening
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="hybrid-viewport__footer">
            <span>The SoundCloud player stays docked inside the page.</span>
            <span>{isLoading ? "Launching webview" : "Running inside SoundunCloud"}</span>
          </div>
        </section>
      </section>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`native-nav__button ${active ? "native-nav__button--active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function describeView(view: HybridShellView) {
  switch (view) {
    case "likes":
      return {
        title: "Everything you liked, inside the app.",
        detail: "Your SoundCloud likes stay in the webview, but the chrome around it is now ours.",
      };
    case "library":
      return {
        title: "Library, playlists, and history.",
        detail: "This keeps SoundCloud's data and playback, while the desktop frame stays custom.",
      };
    case "discover":
      return {
        title: "Discover without the browser feel.",
        detail: "Browse SoundCloud with our sidebar and window controls instead of the raw site shell.",
      };
    default:
      return {
        title: "Your SoundCloud, in a real desktop frame.",
        detail: "Home opens straight into the embedded SoundCloud feed instead of the old launch gate.",
      };
  }
}
