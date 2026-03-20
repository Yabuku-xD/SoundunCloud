import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  Clock3,
  Disc3,
  Heart,
  House,
  ListMusic,
  LogOut,
  Play,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import soundCloudLogoWhite from "../assets/soundcloud-logo-white.png";
import type {
  AppFeedback,
  PersonalizedHome,
  SoundCloudPlaylist,
  SoundCloudTrack,
  SoundunCloudSnapshot,
} from "../types";

export type NativeView = "home" | "likes" | "playlists" | "recent";

type Props = {
  currentTrack: SoundCloudTrack | null;
  feedback: AppFeedback | null;
  home: PersonalizedHome;
  isLoading: boolean;
  onOpenWebShell: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectTrack: (track: SoundCloudTrack) => void;
  onSignOut: () => Promise<void>;
  onViewChange: (view: NativeView) => void;
  snapshot: SoundunCloudSnapshot | null;
  view: NativeView;
};

export function NativeWorkspace({
  currentTrack,
  feedback,
  home,
  isLoading,
  onOpenWebShell,
  onRefresh,
  onSelectTrack,
  onSignOut,
  onViewChange,
  snapshot,
  view,
}: Props) {
  const featuredTrack =
    currentTrack ?? home.featuredTrack ?? home.feedTracks[0] ?? home.likedTracks[0] ?? null;
  const visibleTracks =
    view === "likes" ? home.likedTracks : view === "recent" ? home.recentTracks : home.feedTracks;

  return (
    <div className="native-shell" data-no-drag>
      <aside className="native-sidebar native-panel">
        <div className="native-brand">
          <img alt="SoundCloud" className="native-brand__logo" src={soundCloudLogoWhite} />
          <div>
            <p className="native-brand__eyebrow">SoundunCloud</p>
            <p className="native-brand__meta">Native desktop mode</p>
          </div>
        </div>

        <nav className="native-nav">
          <NavButton active={view === "home"} icon={<House size={16} />} label="Home" onClick={() => onViewChange("home")} />
          <NavButton active={view === "likes"} icon={<Heart size={16} />} label="Likes" onClick={() => onViewChange("likes")} />
          <NavButton active={view === "playlists"} icon={<ListMusic size={16} />} label="Playlists" onClick={() => onViewChange("playlists")} />
          <NavButton active={view === "recent"} icon={<Clock3 size={16} />} label="Recent" onClick={() => onViewChange("recent")} />
        </nav>

        <div className="native-sidebar__spacer" />

        <div className="native-profile native-panel native-panel--soft">
          <div className="native-profile__avatar">
            {home.viewer.avatarUrl ? <img alt={home.viewer.username} src={home.viewer.avatarUrl} /> : <span>{home.viewer.username.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <p className="native-profile__name">{home.viewer.fullName || home.viewer.username}</p>
            <p className="native-profile__meta">
              {snapshot?.desktopContext.platformLabel ?? "desktop"} · v{snapshot?.desktopContext.version ?? "0.0.0"}
            </p>
          </div>
        </div>

        <div className="native-sidebar__actions">
          <button className="control-chip" onClick={() => void onOpenWebShell()} type="button">
            <ArrowUpRight size={14} />
            Web shell
          </button>
          <button className="control-chip" onClick={() => void onSignOut()} type="button">
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="native-main">
        <header className="native-topbar native-panel">
          <div>
            <p className="native-topbar__eyebrow">Custom SoundCloud workspace</p>
            <h1 className="native-topbar__title">{view === "home" ? "Your SoundCloud, re-framed." : view === "playlists" ? "Playlists" : view === "likes" ? "Liked tracks" : "Recently played"}</h1>
          </div>
          <div className="native-topbar__actions">
            <button className="control-chip" disabled={isLoading} onClick={() => void onRefresh()} type="button">
              <RefreshCw size={14} />
              Refresh
            </button>
            <button className="control-chip control-chip--accent" onClick={() => void onOpenWebShell()} type="button">
              <ArrowUpRight size={14} />
              Open site
            </button>
          </div>
        </header>

        {feedback ? <div className={`feedback-banner feedback-banner--${feedback.tone}`}>{feedback.message}</div> : null}

        {featuredTrack ? (
          <section className="native-hero native-panel">
            <div className="native-hero__content">
              <p className="native-topbar__eyebrow">Featured now</p>
              <h2 className="native-hero__title">{featuredTrack.title}</h2>
              <p className="native-hero__meta">{trackArtistLabel(featuredTrack)} · {formatDuration(featuredTrack.duration)}</p>
              <p className="native-hero__detail">Feed: {home.feedTracks.length} · Likes: {home.likedTracks.length} · Playlists: {home.playlists.length}</p>
              <div className="native-hero__actions">
                <button className="button button--primary" onClick={() => onSelectTrack(featuredTrack)} type="button">
                  <Play size={15} />
                  Play here
                </button>
                <button className="button button--ghost" onClick={() => void openUrl(featuredTrack.permalinkUrl)} type="button">
                  <ArrowUpRight size={15} />
                  Open on SoundCloud
                </button>
              </div>
            </div>
            <Artwork title={featuredTrack.title} url={featuredTrack.artworkUrl} />
          </section>
        ) : null}

        <Section label={view === "playlists" ? "Collections from SoundCloud" : view === "likes" ? "Everything you liked" : view === "recent" ? "Recent tracks from this device" : "From your SoundCloud feed"} title={view === "playlists" ? "Playlists" : view === "likes" ? "Liked tracks" : view === "recent" ? "Recently played" : "Feed"}>
          {view === "playlists" ? <PlaylistGrid playlists={home.playlists} /> : <TrackGrid currentTrackUrn={currentTrack?.urn ?? null} onSelectTrack={onSelectTrack} tracks={visibleTracks} />}
        </Section>
      </section>

      {currentTrack ? (
        <div className="native-player native-panel">
          <div className="native-player__meta">
            <Artwork compact title={currentTrack.title} url={currentTrack.artworkUrl} />
            <div>
              <p className="native-player__label">Now playing</p>
              <h3 className="native-player__title">{currentTrack.title}</h3>
              <p className="native-player__artist">{trackArtistLabel(currentTrack)}</p>
            </div>
          </div>
          <iframe allow="autoplay" className="native-player__frame" src={buildCompactWidgetSrc(currentTrack.permalinkUrl)} title={`SoundCloud player for ${currentTrack.title}`} />
        </div>
      ) : null}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`native-nav__button ${active ? "native-nav__button--active" : ""}`} onClick={onClick} type="button">{icon}<span>{label}</span></button>;
}

function Section({ children, label, title }: { children: ReactNode; label: string; title: string }) {
  return <section className="native-section"><div className="native-section__header"><div><h2 className="native-section__title">{title}</h2><p className="native-section__meta">{label}</p></div></div>{children}</section>;
}

function TrackGrid({ currentTrackUrn, onSelectTrack, tracks }: { currentTrackUrn: string | null; onSelectTrack: (track: SoundCloudTrack) => void; tracks: SoundCloudTrack[] }) {
  if (tracks.length === 0) return <EmptyPanel detail="Try refreshing or reconnecting your SoundCloud session." title="Nothing here yet." />;
  return <div className="track-grid">{tracks.map((track) => <button className={`track-card native-panel native-panel--soft ${currentTrackUrn === track.urn ? "track-card--active" : ""}`} key={track.urn} onClick={() => onSelectTrack(track)} type="button"><div className="track-card__art"><Artwork title={track.title} url={track.artworkUrl} /></div><div className="track-card__body"><p className="track-card__title">{track.title}</p><p className="track-card__meta">{trackArtistLabel(track)}</p><div className="track-card__footer"><span>{formatDuration(track.duration)}</span><span>{formatCount(track.playbackCount)} plays</span></div></div></button>)}</div>;
}

function PlaylistGrid({ playlists }: { playlists: SoundCloudPlaylist[] }) {
  if (playlists.length === 0) return <EmptyPanel detail="SoundCloud did not return any playlists for this account yet." title="No playlists returned." />;
  return <div className="playlist-grid">{playlists.map((playlist) => <button className="playlist-card native-panel native-panel--soft" key={playlist.urn} onClick={() => void openUrl(playlist.permalinkUrl)} type="button"><div className="track-card__art"><Artwork title={playlist.title} url={playlist.artworkUrl} /></div><div className="track-card__body"><p className="track-card__title">{playlist.title}</p><p className="track-card__meta">{playlist.user?.fullName || playlist.user?.username || "SoundCloud"}</p><div className="track-card__footer"><span>{playlist.trackCount} tracks</span><span>Open</span></div></div></button>)}</div>;
}

function EmptyPanel({ detail, title }: { detail: string; title: string }) {
  return <div className="empty-panel native-panel native-panel--soft"><p className="empty-panel__title">{title}</p><p className="empty-panel__meta">{detail}</p></div>;
}

function Artwork({ compact = false, title, url }: { compact?: boolean; title: string; url?: string | null }) {
  const resolvedUrl = url ? url.replace("-large", "-t500x500") : null;
  if (resolvedUrl) return <img alt={title} className={compact ? "artwork artwork--compact" : "artwork"} src={resolvedUrl} />;
  return <div className={`art-fallback ${compact ? "art-fallback--small" : ""}`}><Disc3 size={compact ? 24 : 34} /></div>;
}

function trackArtistLabel(track: SoundCloudTrack) {
  return track.user?.fullName || track.user?.username || "SoundCloud";
}

function formatDuration(durationMs: number) {
  if (!durationMs) return "Live from SoundCloud";
  const totalSeconds = Math.floor(durationMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${`${totalSeconds % 60}`.padStart(2, "0")}`;
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function buildCompactWidgetSrc(url: string) {
  return `https://w.soundcloud.com/player/?${new URLSearchParams({ url, auto_play: "false", visual: "false", color: "#ff6a00", buying: "false", sharing: "false", download: "false", show_comments: "false", show_playcount: "false", hide_related: "false", show_artwork: "false", show_user: "true" }).toString()}`;
}
