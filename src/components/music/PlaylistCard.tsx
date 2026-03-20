import React from 'react';
import { useNavigate } from 'react-router-dom';
import { art, fc } from '../../lib/formatters';
import type { Playlist } from '../../lib/hooks';
import { Heart, ListMusic, Play, pauseBlack22 } from '../../lib/icons';
import type { Track } from '../../stores/player';
import { usePlayerStore } from '../../stores/player';
import { AppImage } from '../ui/AppImage';

interface PlaylistCardProps {
  playlist: Playlist;
  /** Show play button, playlist type badge, likes count */
  showPlayback?: boolean;
  tone?: 'dark' | 'light';
}

export const PlaylistCard = React.memo(
  function PlaylistCard({ playlist, showPlayback, tone = 'dark' }: PlaylistCardProps) {
    const navigate = useNavigate();
    const light = tone === 'light';
    const cover =
      art(playlist.artwork_url, 't300x300') ?? art(playlist.tracks?.[0]?.artwork_url, 't300x300');

    const trackUrns = React.useMemo(
      () => new Set((playlist.tracks ?? []).map((t: Track) => t.urn)),
      [playlist.tracks],
    );
    const isPlayingFromThis = usePlayerStore(
      (s) =>
        !!showPlayback &&
        s.isPlaying &&
        s.currentTrack != null &&
        trackUrns.has(s.currentTrack.urn),
    );
    const isPausedFromThis = usePlayerStore(
      (s) =>
        !!showPlayback &&
        !s.isPlaying &&
        s.currentTrack != null &&
        trackUrns.has(s.currentTrack.urn),
    );

    const handlePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      const { play, pause, resume } = usePlayerStore.getState();
      if (isPlayingFromThis) {
        pause();
        return;
      }
      if (isPausedFromThis) {
        resume();
        return;
      }
      if (playlist.tracks && playlist.tracks.length > 0) {
        play(playlist.tracks[0], playlist.tracks);
      } else {
        navigate(`/playlist/${encodeURIComponent(playlist.urn)}`);
      }
    };

    return (
      <div
        className="group relative flex flex-col gap-3 cursor-pointer"
        onClick={() => navigate(`/playlist/${encodeURIComponent(playlist.urn)}`)}
      >
        <div
          className={`relative aspect-square overflow-hidden rounded-[26px] transition-all duration-500 ease-[var(--ease-apple)] ${
            light
              ? 'bg-[#f6f1fb] ring-1 ring-[#ece5f6] shadow-[0_18px_34px_rgba(188,177,220,0.14)] group-hover:ring-[#ded3ef]'
              : 'bg-white/[0.02] ring-1 ring-white/[0.06] shadow-[0_16px_40px_rgba(0,0,0,0.24)] group-hover:shadow-[0_22px_60px_rgba(0,0,0,0.3)] group-hover:ring-white/[0.15]'
          }`}
        >
          {cover ? (
            <AppImage
              src={cover}
              alt={playlist.title}
              width={300}
              height={300}
              containerClassName="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.05]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent image-shell">
              <ListMusic size={32} className="text-white/10" />
            </div>
          )}

          {/* Hover / playing overlay */}
          {showPlayback ? (
            <div
              className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                isPlayingFromThis
                  ? light
                    ? 'bg-white/35 backdrop-blur-sm opacity-100'
                    : 'bg-black/40 backdrop-blur-sm opacity-100'
                  : light
                    ? 'bg-white/0 opacity-0 group-hover:bg-white/35 group-hover:backdrop-blur-sm group-hover:opacity-100'
                    : 'bg-black/0 opacity-0 group-hover:bg-black/40 group-hover:backdrop-blur-sm group-hover:opacity-100'
              }`}
            >
              <div
                onClick={handlePlay}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ease-[var(--ease-apple)] shadow-2xl hover:scale-110 active:scale-95 ${
                  isPlayingFromThis
                    ? 'bg-white scale-100'
                    : 'bg-white/90 scale-75 group-hover:scale-100'
                }`}
              >
                {isPlayingFromThis ? (
                  pauseBlack22
                ) : (
                  <Play size={22} fill="black" strokeWidth={0} className="ml-1" />
                )}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}

          {playlist.track_count != null && (
            <div
              className={`absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full shadow-lg ${
                light
                  ? 'bg-white/92 text-[#45365f] ring-1 ring-[#ece5f6]'
                  : 'bg-black/60 text-white/90'
              } ${
                showPlayback
                  ? 'opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                  : ''
              }`}
            >
              <ListMusic size={11} />
              {playlist.track_count}
            </div>
          )}
        </div>

        <div className="min-w-0 px-1">
          <p
            className={`truncate text-[14px] font-semibold leading-snug transition-colors duration-200 ${
              light ? 'text-[#2f2442] group-hover:text-[#1e172e]' : 'text-white/92 group-hover:text-white'
            }`}
          >
            {playlist.title}
          </p>
          {showPlayback ? (
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  light ? 'bg-[#f3eef8] text-[#8b7fa1]' : 'bg-white/[0.05] text-white/36'
                }`}
              >
                {playlist.playlist_type || 'Playlist'}
              </span>
              {playlist.likes_count > 0 && (
                <span
                  className={`flex items-center gap-1 text-[11px] tabular-nums ${
                    light ? 'text-[#8f84a6]' : 'text-white/30'
                  }`}
                >
                  <Heart size={10} className={light ? 'text-[#b1a6c4]' : 'text-white/20'} />
                  {fc(playlist.likes_count)}
                </span>
              )}
            </div>
          ) : (
            <p className={`mt-1 truncate text-[12px] ${light ? 'text-[#8f84a6]' : 'text-white/40'}`}>
              {playlist.user?.username || 'Unknown'}
            </p>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.playlist.urn === next.playlist.urn && prev.showPlayback === next.showPlayback,
);
