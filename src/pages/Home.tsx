import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrackCard } from '../components/music/TrackCard';
import { AppImage } from '../components/ui/AppImage';
import { HorizontalScroll } from '../components/ui/HorizontalScroll';
import { Skeleton } from '../components/ui/Skeleton';
import { preloadTrack } from '../lib/audio';
import { art } from '../lib/formatters';
import { ChevronRight, Heart, pauseBlack18, playBlack18 } from '../lib/icons';
import { useFallbackTracks, useLikedTracks } from '../lib/hooks';
import { useTrackPlay } from '../lib/useTrackPlay';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 6) return 'home.goodNight';
  if (hour < 12) return 'home.goodMorning';
  if (hour < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

const sectionVisibilityStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '520px',
} as const;

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-white/90">{title}</h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/38 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/72"
        >
          {t('common.seeAll')}
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="w-[172px] shrink-0">
          <Skeleton className="aspect-square w-full" rounded="lg" />
          <Skeleton className="mt-2.5 h-4 w-3/4" rounded="sm" />
          <Skeleton className="mt-1.5 h-3 w-1/2" rounded="sm" />
        </div>
      ))}
    </>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="glass-flat flex min-h-[220px] items-center gap-6 rounded-[28px] p-5">
      <Skeleton className="h-[160px] w-[160px] shrink-0" rounded="lg" />
      <div className="min-w-0 flex-1 space-y-3">
        <Skeleton className="h-4 w-24" rounded="sm" />
        <Skeleton className="h-10 w-2/3" rounded="sm" />
        <Skeleton className="h-4 w-1/3" rounded="sm" />
      </div>
      <Skeleton className="h-14 w-14 shrink-0" rounded="full" />
    </div>
  );
}

const FeaturedTrackCard = React.memo(function FeaturedTrackCard({
  track,
  queue,
}: {
  track: Track;
  queue: Track[];
}) {
  const navigate = useNavigate();
  const { isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't500x500');

  return (
    <div
      className="glass-flat relative overflow-hidden rounded-[28px] border border-white/[0.06] p-5 md:p-6"
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      {cover && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AppImage
            src={cover}
            alt=""
            width={500}
            height={500}
            priority
            containerClassName="h-full w-full"
            imgClassName="h-full w-full object-cover scale-[1.16] blur-[84px] opacity-[0.14]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(7,7,10,0.88),rgba(7,7,10,0.62),rgba(7,7,10,0.82))]" />
        </div>
      )}

      <div className="relative grid items-center gap-5 md:grid-cols-[188px_1fr_auto]">
        <button
          type="button"
          onClick={togglePlay}
          className="group relative aspect-square overflow-hidden rounded-[24px] bg-white/[0.04] ring-1 ring-white/[0.08]"
        >
          {cover ? (
            <AppImage
              src={cover}
              alt={track.title}
              width={188}
              height={188}
              priority
              containerClassName="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-apple)] group-hover:scale-[1.03]"
            />
          ) : (
            <div className="h-full w-full bg-white/[0.04]" />
          )}
          <div className="absolute inset-0 bg-black/12 transition-colors duration-200 group-hover:bg-black/24" />
        </button>

        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/34">
            Selected for you
          </p>
          <h2
            className="mt-3 max-w-[12ch] cursor-pointer text-[clamp(1.9rem,3vw,3.3rem)] font-bold leading-[0.94] tracking-[-0.05em] text-white/96 transition-colors duration-200 hover:text-white"
            onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
          >
            {track.title}
          </h2>
          <p
            className="mt-3 cursor-pointer text-[14px] text-white/48 transition-colors duration-200 hover:text-white/68"
            onClick={() => navigate(`/user/${encodeURIComponent(track.user.urn)}`)}
          >
            {track.user.username}
          </p>
          {track.genre && (
            <div className="mt-4">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/44">
                {track.genre}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isThisPlaying ? 'Pause track' : 'Play track'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/90 text-black shadow-[0_16px_36px_rgba(0,0,0,0.28)] transition-transform duration-200 ease-[var(--ease-apple)] hover:scale-[1.04] active:scale-[0.96]"
        >
          {isThisPlaying ? pauseBlack18 : playBlack18}
        </button>
      </div>
    </div>
  );
});

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { tracks: likedTracks, isLoading: likedLoading } = useLikedTracks(12);
  const { data: fallbackData, isLoading: fallbackLoading } = useFallbackTracks();

  const fallbackTracks = useMemo(() => (fallbackData?.collection ?? []).slice(0, 8), [fallbackData]);
  const featuredQueue = likedTracks.length > 0 ? likedTracks : fallbackTracks;
  const featuredTrack = featuredQueue[0] ?? null;
  const showFallbackShelf = likedTracks.length === 0 && (fallbackLoading || fallbackTracks.length > 0);

  return (
    <div className="space-y-5 px-4 py-4 md:px-6">
      <section className="section-frame px-5 py-6 md:px-7" style={sectionVisibilityStyle}>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/32">
          SoundCloud desktop
        </p>
        <h1 className="mt-3 text-[clamp(2.4rem,5vw,4.2rem)] font-bold leading-[0.92] tracking-[-0.06em] text-white/96">
          {t(greetingKey())}
          {user?.username ? `, ${user.username}` : ''}
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-6 text-white/42">
          Minimal playback, lighter shelves, and less noise.
        </p>
      </section>

      <section style={sectionVisibilityStyle}>
        {likedLoading && !featuredTrack ? (
          <FeaturedSkeleton />
        ) : featuredTrack ? (
          <FeaturedTrackCard track={featuredTrack} queue={featuredQueue} />
        ) : null}
      </section>

      <section className="section-frame" style={sectionVisibilityStyle}>
        <SectionHeader
          title={likedTracks.length > 0 ? t('library.likedTracks') : 'Quick Picks'}
          onSeeAll={likedTracks.length > 0 ? () => navigate('/library') : undefined}
        />
        <HorizontalScroll>
          {likedLoading ? (
            <ShelfSkeleton />
          ) : likedTracks.length > 0 ? (
            likedTracks.map((track) => (
              <div key={track.urn} className="w-[172px] shrink-0">
                <TrackCard track={track} queue={likedTracks} />
              </div>
            ))
          ) : (
            fallbackTracks.map((track) => (
              <div key={track.urn} className="w-[172px] shrink-0">
                <TrackCard track={track} queue={fallbackTracks} />
              </div>
            ))
          )}
        </HorizontalScroll>
      </section>

      {showFallbackShelf && (
        <section className="section-frame" style={sectionVisibilityStyle}>
          <SectionHeader title="Start here" />
          <div className="mb-4 flex items-center gap-2 text-[13px] text-white/38">
            <Heart size={14} className="text-accent" />
            <span>Fresh picks while your library is still loading up.</span>
          </div>
          <HorizontalScroll>
            {fallbackLoading ? (
              <ShelfSkeleton count={5} />
            ) : (
              fallbackTracks.map((track) => (
                <div key={track.urn} className="w-[172px] shrink-0">
                  <TrackCard track={track} queue={fallbackTracks} />
                </div>
              ))
            )}
          </HorizontalScroll>
        </section>
      )}
    </div>
  );
}
