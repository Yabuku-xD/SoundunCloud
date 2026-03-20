import { useMemo } from 'react';
import { AppImage } from '../components/ui/AppImage';
import { Avatar } from '../components/ui/Avatar';
import { preloadTrack } from '../lib/audio';
import { art, dur } from '../lib/formatters';
import { Clock, Heart, Headphones, pauseBlack18, playBlack18, Users } from '../lib/icons';
import { useFallbackTracks, useFollowingTracks, useLikedTracks } from '../lib/hooks';
import { useTrackPlay } from '../lib/useTrackPlay';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';

const surface =
  'rounded-[28px] border border-[#ece6f6] bg-white/[0.88] shadow-[0_18px_50px_rgba(189,180,223,0.18)]';

const sectionVisibilityStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '520px',
} as const;

function HeroTrackRow({
  track,
  index,
  queue,
}: {
  track: Track;
  index: number;
  queue: Track[];
}) {
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);

  return (
    <button
      type="button"
      onClick={togglePlay}
      className="grid w-full grid-cols-[24px_minmax(0,1fr)_44px] items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#f5f1fb]"
    >
      <span className="text-[12px] font-medium text-[#a093b6]">{index + 1}</span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#2f2442]">{track.title}</p>
        <p className="truncate text-[11px] text-[#8e84a4]">{track.user.username}</p>
      </div>
      <div className="flex items-center justify-end text-[11px] text-[#9e93b2]">
        {isThisPlaying ? pauseBlack18 : dur(track.duration)}
      </div>
    </button>
  );
}

function FeaturePanel({ track, queue }: { track: Track; queue: Track[] }) {
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't500x500');

  return (
    <div
      className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      <div className="relative aspect-square overflow-hidden rounded-[24px] bg-[#efe9f8] shadow-[0_16px_40px_rgba(189,180,223,0.22)]">
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
          <div className="h-full w-full bg-[#efe9f8]" />
        )}
      </div>

      <div className="flex min-w-0 flex-col justify-between">
        <div>
          <p className="text-[12px] font-medium text-[#8f84a6]">Releases for You</p>
          <h2 className="mt-3 max-w-[14ch] text-[clamp(1.9rem,3vw,3.2rem)] font-bold leading-[0.95] tracking-[-0.05em] text-[#2f2442]">
            {track.title}
          </h2>
          <p className="mt-2 text-[13px] text-[#8f84a6]">{track.user.username}</p>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#2f2442] text-white shadow-[0_14px_30px_rgba(53,40,77,0.24)] transition-transform duration-150 hover:scale-[1.03]"
        >
          {isThisPlaying ? pauseBlack18 : playBlack18}
        </button>
      </div>
    </div>
  );
}

function TrackTile({ track, queue }: { track: Track; queue: Track[] }) {
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't300x300');

  return (
    <button
      type="button"
      onClick={togglePlay}
      className="group w-[132px] shrink-0 text-left"
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      <div className="relative aspect-square overflow-hidden rounded-[20px] bg-[#efe9f8] shadow-[0_10px_28px_rgba(189,180,223,0.18)]">
        {cover ? (
          <AppImage
            src={cover}
            alt={track.title}
            width={132}
            height={132}
            containerClassName="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-[#efe9f8]" />
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/10" />
      </div>
      <p className="mt-2 truncate text-[12px] font-semibold text-[#2f2442]">{track.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-[#9388a8]">{track.user.username}</p>
      <p className="mt-0.5 text-[10px] text-[#aea3c0]">{isThisPlaying ? 'Playing' : dur(track.duration)}</p>
    </button>
  );
}

function ActivityItem({
  avatar,
  title,
  subtitle,
}: {
  avatar?: string | null;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-[#faf8fd] px-3 py-2.5">
      <Avatar src={avatar} alt={title} size={34} />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[#2f2442]">{title}</p>
        <p className="truncate text-[11px] text-[#9b91af]">{subtitle}</p>
      </div>
    </div>
  );
}

export function Home() {
  const user = useAuthStore((state) => state.user);
  const { tracks: likedTracks, isLoading: likedLoading } = useLikedTracks(12);
  const { data: fallbackData } = useFallbackTracks();
  const { data: followingData } = useFollowingTracks(6);

  const fallbackTracks = useMemo(() => fallbackData?.collection ?? [], [fallbackData]);
  const followingTracks = useMemo(() => followingData?.collection ?? [], [followingData]);
  const queue = likedTracks.length > 0 ? likedTracks : fallbackTracks;
  const featuredTrack = queue[0] ?? null;
  const recentTracks = (likedTracks.length > 0 ? likedTracks : fallbackTracks).slice(0, 6);
  const heroList = queue.slice(0, 5);
  const friendsActivity = (followingTracks.length > 0 ? followingTracks : recentTracks).slice(0, 5);
  const yourActivity = recentTracks.slice(0, 4);

  return (
    <div className="px-5 py-5 md:px-6 md:py-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <section className={`${surface} p-5 md:p-6`} style={sectionVisibilityStyle}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              {featuredTrack ? (
                <FeaturePanel track={featuredTrack} queue={queue} />
              ) : (
                <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="aspect-square rounded-[24px] bg-[#efe9f8]" />
                  <div className="space-y-3">
                    <div className="h-4 w-28 rounded-full bg-[#efe9f8]" />
                    <div className="h-12 w-2/3 rounded-[18px] bg-[#f4f1fb]" />
                    <div className="h-4 w-1/3 rounded-full bg-[#efe9f8]" />
                  </div>
                </div>
              )}

              <div className="rounded-[24px] bg-[#faf8fd] p-3">
                <div className="space-y-1">
                  {heroList.map((track, index) => (
                    <HeroTrackRow key={track.urn} track={track} index={index} queue={queue} />
                  ))}
                  {!likedLoading && heroList.length === 0 && (
                    <p className="px-3 py-5 text-[12px] text-[#9a90ae]">Your queue will show up here.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className={`${surface} p-5`} style={sectionVisibilityStyle}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-semibold text-[#2f2442]">Recently Played</h3>
                <p className="mt-1 text-[12px] text-[#968cab]">A lighter desktop mix from your likes.</p>
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
        </div>

        <aside className="space-y-5" style={sectionVisibilityStyle}>
          <section className={`${surface} p-5`}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#2f2442]">Friends Activity</h3>
              <Users size={14} className="text-[#9b91af]" />
            </div>
            <div className="mt-4 space-y-2.5">
              {friendsActivity.map((track) => (
                <ActivityItem
                  key={track.urn}
                  avatar={track.user.avatar_url}
                  title={track.user.username}
                  subtitle={track.title}
                />
              ))}
              {friendsActivity.length === 0 && (
                <p className="text-[12px] text-[#9b91af]">Activity will show up here.</p>
              )}
            </div>
          </section>

          <section className={`${surface} p-5`}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#2f2442]">Your Activity</h3>
              <Clock size={14} className="text-[#9b91af]" />
            </div>

            <div className="mt-4 grid gap-2.5">
              <div className="rounded-[20px] bg-[#faf8fd] px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] text-[#9b91af]">
                  <Heart size={13} />
                  <span>Liked tracks</span>
                </div>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.04em] text-[#2f2442]">
                  {user?.public_favorites_count ?? likedTracks.length}
                </p>
              </div>
              <div className="rounded-[20px] bg-[#faf8fd] px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] text-[#9b91af]">
                  <Headphones size={13} />
                  <span>Following</span>
                </div>
                <p className="mt-2 text-[28px] font-bold tracking-[-0.04em] text-[#2f2442]">
                  {user?.followings_count ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {yourActivity.map((track) => (
                <ActivityItem
                  key={track.urn}
                  avatar={track.artwork_url}
                  title={track.title}
                  subtitle={track.user.username}
                />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
