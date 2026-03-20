import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { PlaylistCard } from '../components/music/PlaylistCard';
import { AppImage } from '../components/ui/AppImage';
import { preloadTrack } from '../lib/audio';
import { art, dur } from '../lib/formatters';
import { Headphones, Heart, Library, ListMusic, Pause, Play } from '../lib/icons';
import {
  useFallbackTracks,
  useLikedTracks,
  useMyLikedPlaylists,
  useMyPlaylists,
} from '../lib/hooks';
import { useTrackPlay } from '../lib/useTrackPlay';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';

const surface =
  'rounded-[30px] border border-[#e8e1f3] bg-white/[0.88] shadow-[0_18px_46px_rgba(188,177,220,0.12)]';

const sectionVisibilityStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '520px',
} as const;

function TrackTile({ track, queue }: { track: Track; queue: Track[] }) {
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't300x300');

  return (
    <button
      type="button"
      onClick={togglePlay}
      className="group w-[148px] shrink-0 text-left"
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      <div className="relative aspect-square overflow-hidden rounded-[22px] bg-[#f1ebf8] shadow-[0_12px_28px_rgba(188,177,220,0.12)]">
        {cover ? (
          <AppImage
            src={cover}
            alt={track.title}
            width={148}
            height={148}
            containerClassName="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-[#f1ebf8]" />
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/12" />
      </div>
      <p className="mt-3 truncate text-[13px] font-semibold text-[#2f2442]">{track.title}</p>
      <p className="mt-1 truncate text-[11px] text-[#9388a8]">{track.user.username}</p>
      <p className="mt-1 text-[10px] text-[#b0a5c1]">{isThisPlaying ? 'Playing' : dur(track.duration)}</p>
    </button>
  );
}

function FeaturePanel({ track, queue }: { track: Track; queue: Track[] }) {
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't500x500');

  return (
    <section
      className="rounded-[34px] border border-[#ebe3f5] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(249,245,252,0.9))] p-6 shadow-[0_18px_46px_rgba(188,177,220,0.12)]"
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative aspect-square overflow-hidden rounded-[28px] bg-[#f2ecf8] shadow-[0_16px_34px_rgba(188,177,220,0.16)]">
          {cover ? (
            <AppImage
              src={cover}
              alt={track.title}
              width={220}
              height={220}
              priority
              containerClassName="h-full w-full"
              imgClassName="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[#f2ecf8]" />
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a294b8]">
              Releases for you
            </p>
            <h1 className="mt-4 max-w-[11ch] text-[clamp(2.5rem,4.4vw,4.2rem)] font-bold leading-[0.9] tracking-[-0.08em] text-[#2f2442]">
              {track.title}
            </h1>
            <p className="mt-3 text-[14px] text-[#867b9d]">{track.user.username}</p>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-13 w-13 items-center justify-center rounded-full bg-accent text-white shadow-[0_16px_34px_rgba(255,113,52,0.22)] transition-transform duration-150 hover:scale-[1.03]"
            >
              {isThisPlaying ? <Pause size={20} fill="white" strokeWidth={0} /> : <Play size={20} fill="white" strokeWidth={0} className="ml-0.5" />}
            </button>
            <div>
              <p className="text-[13px] font-semibold text-[#352a4d]">Start here</p>
              <p className="text-[11px] text-[#988dab]">Fast load, native playback, lighter library flow.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[24px] border border-[#ece5f6] bg-[#faf8fd] px-5 py-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#968bac]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 text-[34px] font-bold tracking-[-0.06em] text-[#2f2442]">{value}</p>
    </div>
  );
}

export function Home() {
  const user = useAuthStore((state) => state.user);
  const { tracks: likedTracks } = useLikedTracks(18);
  const { data: fallbackData } = useFallbackTracks();
  const { playlists: myPlaylists } = useMyPlaylists(6);
  const { playlists: likedPlaylists } = useMyLikedPlaylists(6);

  const fallbackTracks = useMemo(() => fallbackData?.collection ?? [], [fallbackData]);
  const queue = likedTracks.length > 0 ? likedTracks : fallbackTracks;
  const featuredTrack = queue[0] ?? null;
  const recentTracks = queue.slice(0, 8);
  const suggestedTracks = (likedTracks.length > 8 ? likedTracks.slice(8, 16) : fallbackTracks.slice(0, 8)).filter(
    (track) => !recentTracks.some((recent) => recent.urn === track.urn),
  );
  const playlistShelf = [...myPlaylists, ...likedPlaylists]
    .filter((playlist, index, array) => array.findIndex((candidate) => candidate.urn === playlist.urn) === index)
    .slice(0, 6);

  return (
    <div className="px-6 py-6">
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>{featuredTrack && <FeaturePanel track={featuredTrack} queue={queue} />}</div>

          <section className={`${surface} flex flex-col gap-3 p-4`} style={sectionVisibilityStyle}>
            <div className="px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a294b8]">
                Your activity
              </p>
              <h2 className="mt-3 text-[28px] font-bold tracking-[-0.06em] text-[#2f2442]">
                Good afternoon, {user?.username ?? 'there'}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[#8d82a2]">
                Your desktop mix keeps the essentials close: likes, playlists, and the next track to play.
              </p>
            </div>

            <StatCard icon={<Heart size={13} />} label="Liked tracks" value={user?.public_favorites_count ?? likedTracks.length} />
            <StatCard icon={<ListMusic size={13} />} label="Playlists" value={myPlaylists.length + likedPlaylists.length} />
            <StatCard icon={<Headphones size={13} />} label="Following" value={user?.followings_count ?? 0} />
          </section>
        </div>

        <section className={`${surface} p-5`} style={sectionVisibilityStyle}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[18px] font-semibold text-[#2f2442]">Recently played</h3>
              <p className="mt-1 text-[12px] text-[#968cab]">Quick access to the tracks already sitting closest to your queue.</p>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex gap-4">
              {recentTracks.map((track) => (
                <TrackTile key={track.urn} track={track} queue={queue} />
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className={`${surface} p-5`} style={sectionVisibilityStyle}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-semibold text-[#2f2442]">Recommended next</h3>
                <p className="mt-1 text-[12px] text-[#968cab]">More of your SoundCloud taste, without the fake activity column.</p>
              </div>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="flex gap-4">
                {suggestedTracks.map((track) => (
                  <TrackTile key={track.urn} track={track} queue={queue} />
                ))}
              </div>
            </div>
          </section>

          <section className={`${surface} p-5`} style={sectionVisibilityStyle}>
            <div className="mb-4 flex items-center gap-2">
              <Library size={14} className="text-[#a294b8]" />
              <h3 className="text-[18px] font-semibold text-[#2f2442]">Library snapshot</h3>
            </div>
            <div className="space-y-3">
              {playlistShelf.map((playlist) => (
                <div key={playlist.urn} className="rounded-[24px] border border-[#eee8f6] bg-[#faf8fd] p-3">
                  <PlaylistCard playlist={playlist} showPlayback tone="light" />
                </div>
              ))}
              {playlistShelf.length === 0 && (
                <div className="rounded-[24px] border border-[#eee8f6] bg-[#faf8fd] px-4 py-6 text-[13px] text-[#8d82a2]">
                  Your playlists will show up here once they load.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
