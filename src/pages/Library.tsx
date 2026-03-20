import type { MouseEvent } from 'react';
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AddToPlaylistDialog } from '../components/music/AddToPlaylistDialog';
import { LikeButton } from '../components/music/LikeButton';
import { PlaylistCard } from '../components/music/PlaylistCard';
import { AppImage } from '../components/ui/AppImage';
import { preloadTrack } from '../lib/audio';
import { art, dur, fc } from '../lib/formatters';
import {
  fetchAllLikedTracks,
  type SCUser,
  useInfiniteScroll,
  useLikedTracks,
  useMyFollowings,
  useMyLikedPlaylists,
  useMyPlaylists,
} from '../lib/hooks';
import {
  Heart,
  headphones11,
  heart11,
  ListMusic,
  ListPlus,
  Loader2,
  Music,
  Pause,
  Play,
  Search as SearchIcon,
  User,
  Users,
  X,
} from '../lib/icons';
import { useTrackPlay } from '../lib/useTrackPlay';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';
import { usePlayerStore } from '../stores/player';

const panel =
  'rounded-[30px] border border-[#e8e1f3] bg-white/[0.88] shadow-[0_18px_46px_rgba(188,177,220,0.12)]';

const rowBase =
  'group flex items-center gap-4 rounded-[22px] border border-[#eee8f6] bg-[#fbf9fd] px-4 py-3 transition-colors duration-200 hover:bg-white';

const LibraryTrackRow = memo(function LibraryTrackRow({
  track,
  queue,
  onPlay,
}: {
  track: Track;
  queue: Track[];
  onPlay?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isThis, isThisPlaying, togglePlay: baseToggle } = useTrackPlay(track, queue);
  const addToQueueNext = usePlayerStore((state) => state.addToQueueNext);
  const cover = art(track.artwork_url, 't200x200');

  const togglePlay = () => {
    baseToggle();
    if (!isThis && onPlay) onPlay();
  };

  return (
    <div className={`${rowBase} ${isThis ? 'ring-1 ring-[#e6d6ff] bg-white' : ''}`}>
      <button
        type="button"
        onClick={togglePlay}
        onMouseEnter={() => preloadTrack(track.urn)}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
          isThisPlaying
            ? 'bg-accent text-white shadow-[0_12px_24px_rgba(255,113,52,0.2)]'
            : 'bg-[#f2ecf8] text-[#4f406c] hover:bg-[#ebe4f5]'
        }`}
      >
        {isThisPlaying ? <Pause size={16} fill="white" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
      </button>

      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[16px] bg-[#efe8f7]">
        {cover ? (
          <AppImage
            src={cover}
            alt=""
            width={48}
            height={48}
            containerClassName="h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#efe8f7]">
            <Music size={14} className="text-[#a89dbc]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[14px] font-semibold transition-colors ${
            isThis ? 'text-accent' : 'text-[#2f2442] hover:text-[#1f172f]'
          }`}
          onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
        >
          {track.title}
        </p>
        <p
          className="mt-1 truncate text-[12px] text-[#8f84a6] transition-colors hover:text-[#4a3b66]"
          onClick={() => navigate(`/user/${encodeURIComponent(track.user.urn)}`)}
        >
          {track.user.username}
        </p>
      </div>

      <div className="hidden items-center gap-4 pr-3 text-[11px] text-[#a094b6] md:flex">
        {track.playback_count != null && (
          <span className="flex w-16 items-center gap-1.5 tabular-nums">
            {headphones11}
            {fc(track.playback_count)}
          </span>
        )}
        <span className="flex w-14 items-center gap-1.5 tabular-nums">
          {heart11}
          {fc(track.favoritings_count ?? track.likes_count)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <LikeButton track={track} tone="light" />
        <AddToPlaylistDialog trackUrns={[track.urn]}>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9b91af] transition-colors hover:bg-[#f1ecf8] hover:text-[#36294f]"
            title={t('playlist.addToPlaylist')}
          >
            <ListMusic size={14} />
          </button>
        </AddToPlaylistDialog>
        <button
          type="button"
          onClick={() => addToQueueNext([track])}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9b91af] transition-colors hover:bg-[#f1ecf8] hover:text-[#36294f]"
          title={t('player.addToQueue')}
        >
          <ListPlus size={14} />
        </button>
      </div>

      <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-[#a094b6]">
        {dur(track.duration)}
      </span>
    </div>
  );
});

const UserCard = memo(({ user }: { user: SCUser }) => {
  const navigate = useNavigate();
  const avatar = art(user.avatar_url, 't300x300');

  return (
    <button
      type="button"
      onClick={() => navigate(`/user/${encodeURIComponent(user.urn)}`)}
      className="rounded-[26px] border border-[#ece5f6] bg-white p-5 text-center shadow-[0_12px_28px_rgba(188,177,220,0.1)] transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-[#f2ecf8]">
        {avatar ? (
          <AppImage
            src={avatar}
            alt={user.username}
            width={80}
            height={80}
            containerClassName="h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User size={24} className="text-[#a89dbc]" />
          </div>
        )}
      </div>
      <p className="mt-4 truncate text-[15px] font-semibold text-[#2f2442]">{user.username}</p>
      <p className="mt-1 text-[11px] text-[#8f84a6]">{fc(user.followers_count)} followers</p>
    </button>
  );
});

const LibraryHero = memo(function LibraryHero({
  onTabLikes,
  onTabPlaylists,
}: {
  onTabLikes: () => void;
  onTabPlaylists: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { tracks: likedTracks } = useLikedTracks(8);
  const myPlaylists = useMyPlaylists(4).playlists;
  const [shuffleLoading, setShuffleLoading] = useState(false);

  const handleShuffleLikes = async (event: MouseEvent) => {
    event.stopPropagation();
    if (shuffleLoading) return;

    setShuffleLoading(true);
    try {
      const all = await fetchAllLikedTracks();
      if (all.length === 0) return;

      if (!usePlayerStore.getState().shuffle) {
        usePlayerStore.setState({ shuffle: true });
      }

      const random = all[Math.floor(Math.random() * all.length)];
      usePlayerStore.getState().play(random, all);
    } finally {
      setShuffleLoading(false);
    }
  };

  if (!user) return null;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-[34px] border border-[#e8e1f3] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,244,252,0.92))] p-7 shadow-[0_20px_60px_rgba(188,177,220,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a194b8]">
          Library
        </p>
        <h1 className="mt-4 text-[clamp(2.3rem,4vw,3.6rem)] font-bold tracking-[-0.07em] text-[#2f2442]">
          Your SoundCloud collection, simplified.
        </h1>
        <p className="mt-4 max-w-[56ch] text-[14px] leading-7 text-[#7e7394]">
          Likes, playlists, and following live in one lighter desktop view without the extra customization panels.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {['liked tracks', 'playlists', 'following'].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={chip === 'playlists' ? onTabPlaylists : onTabLikes}
              className="rounded-full border border-[#e6def1] bg-white px-4 py-2 text-[12px] font-semibold text-[#786d90]"
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            type="button"
            onClick={handleShuffleLikes}
            disabled={shuffleLoading}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-[0_16px_34px_rgba(255,113,52,0.22)] transition-transform duration-150 hover:scale-[1.03] disabled:opacity-60"
          >
            {shuffleLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="white" strokeWidth={0} className="ml-0.5" />}
          </button>
          <div>
            <p className="text-[13px] font-semibold text-[#352a4d]">{t('library.likedTracks')}</p>
            <p className="text-[11px] text-[#988dab]">
              {fc(user.public_favorites_count)} tracks ready to shuffle.
            </p>
          </div>
        </div>
      </div>

      <div className={`${panel} flex flex-col gap-3 p-4`}>
        <div className="grid gap-3">
          <div className="rounded-[24px] border border-[#ece5f6] bg-[#faf8fd] px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#968bac]">
              <Heart size={13} />
              <span>Likes</span>
            </div>
            <p className="mt-3 text-[32px] font-bold tracking-[-0.06em] text-[#2f2442]">
              {fc(user.public_favorites_count)}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#ece5f6] bg-[#faf8fd] px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#968bac]">
              <ListMusic size={13} />
              <span>Playlists</span>
            </div>
            <p className="mt-3 text-[32px] font-bold tracking-[-0.06em] text-[#2f2442]">
              {myPlaylists.length}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#ece5f6] bg-[#faf8fd] px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#968bac]">
              <Users size={13} />
              <span>Following</span>
            </div>
            <p className="mt-3 text-[32px] font-bold tracking-[-0.06em] text-[#2f2442]">
              {fc(user.followings_count)}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#ece5f6] bg-[#faf8fd] p-3">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#968bac]">
            Quick artwork
          </p>
          <div className="mt-3 flex gap-2">
            {likedTracks.slice(0, 4).map((track) => (
              <div key={track.urn} className="h-16 w-16 overflow-hidden rounded-[16px] bg-[#efe8f7]">
                {track.artwork_url ? (
                  <AppImage
                    src={art(track.artwork_url, 't300x300')}
                    alt=""
                    width={64}
                    height={64}
                    containerClassName="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-[#efe8f7]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

const LikesTab = memo(function LikesTab({ filter }: { filter: string }) {
  const { t } = useTranslation();
  const likesQuery = useLikedTracks();
  const { tracks: likedTracks, isLoading } = likesQuery;
  const sentinelRef = useInfiniteScroll(
    !!likesQuery.hasNextPage,
    !!likesQuery.isFetchingNextPage,
    likesQuery.fetchNextPage,
  );

  useEffect(() => {
    if (filter && likesQuery.hasNextPage && !likesQuery.isFetchingNextPage) {
      likesQuery.fetchNextPage();
    }
  }, [filter, likesQuery.fetchNextPage, likesQuery.hasNextPage, likesQuery.isFetchingNextPage]);

  const filtered = useMemo(() => {
    if (!filter) return likedTracks;
    const query = filter.toLowerCase();
    return likedTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(query) ||
        track.user.username.toLowerCase().includes(query),
    );
  }, [filter, likedTracks]);

  const expandQueue = () => {
    fetchAllLikedTracks().then((all) => {
      usePlayerStore.getState().setQueue(all);
    });
  };

  return (
    <section className={`${panel} p-5`}>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#b4a9c6]" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((track) => (
            <LibraryTrackRow key={track.urn} track={track} queue={filtered} onPlay={expandQueue} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center text-[#8d82a2]">
          {filter ? t('library.noMatches') : t('library.noLikedTracks')}
        </div>
      )}

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {likesQuery.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
});

const FollowingTab = memo(function FollowingTab({ filter }: { filter: string }) {
  const { t } = useTranslation();
  const followingsQuery = useMyFollowings();
  const { users: followings, isLoading } = followingsQuery;
  const sentinelRef = useInfiniteScroll(
    !!followingsQuery.hasNextPage,
    !!followingsQuery.isFetchingNextPage,
    followingsQuery.fetchNextPage,
  );

  useEffect(() => {
    if (filter && followingsQuery.hasNextPage && !followingsQuery.isFetchingNextPage) {
      followingsQuery.fetchNextPage();
    }
  }, [
    filter,
    followingsQuery.fetchNextPage,
    followingsQuery.hasNextPage,
    followingsQuery.isFetchingNextPage,
  ]);

  const filtered = useMemo(() => {
    if (!filter) return followings;
    const query = filter.toLowerCase();
    return followings.filter((user) => user.username.toLowerCase().includes(query));
  }, [filter, followings]);

  return (
    <section className={`${panel} p-5`}>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#b4a9c6]" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((user) => (
            <UserCard key={user.urn} user={user} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center text-[#8d82a2]">
          {filter ? t('library.noMatches') : t('library.notFollowing')}
        </div>
      )}

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {followingsQuery.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
});

const PlaylistsTab = memo(function PlaylistsTab({ filter }: { filter: string }) {
  const { t } = useTranslation();
  const myPlaylistsQuery = useMyPlaylists();
  const likedPlaylistsQuery = useMyLikedPlaylists();
  const createdPlaylists = myPlaylistsQuery.playlists;
  const likedPlaylists = likedPlaylistsQuery.playlists;

  const filteredCreated = useMemo(() => {
    if (!filter) return createdPlaylists;
    const query = filter.toLowerCase();
    return createdPlaylists.filter((playlist) => playlist.title.toLowerCase().includes(query));
  }, [createdPlaylists, filter]);

  const filteredLiked = useMemo(() => {
    if (!filter) return likedPlaylists;
    const query = filter.toLowerCase();
    return likedPlaylists.filter((playlist) => playlist.title.toLowerCase().includes(query));
  }, [filter, likedPlaylists]);

  const hasNextPage = likedPlaylistsQuery.hasNextPage || myPlaylistsQuery.hasNextPage;
  const isFetchingNextPage =
    likedPlaylistsQuery.isFetchingNextPage || myPlaylistsQuery.isFetchingNextPage;
  const fetchNextPage = likedPlaylistsQuery.hasNextPage
    ? likedPlaylistsQuery.fetchNextPage
    : myPlaylistsQuery.fetchNextPage;
  const sentinelRef = useInfiniteScroll(!!hasNextPage, !!isFetchingNextPage, fetchNextPage);

  useEffect(() => {
    if (filter && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, filter, hasNextPage, isFetchingNextPage]);

  return (
    <section className={`${panel} p-5`}>
      <div className="space-y-8">
        {filteredCreated.length > 0 && (
          <div>
            <h3 className="mb-4 text-[17px] font-semibold text-[#2f2442]">{t('library.yourPlaylists')}</h3>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
              {filteredCreated.map((playlist) => (
                <PlaylistCard key={playlist.urn} playlist={playlist} tone="light" />
              ))}
            </div>
          </div>
        )}

        {filteredLiked.length > 0 && (
          <div>
            <h3 className="mb-4 text-[17px] font-semibold text-[#2f2442]">{t('library.likedPlaylists')}</h3>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
              {filteredLiked.map((playlist) => (
                <PlaylistCard key={playlist.urn} playlist={playlist} tone="light" />
              ))}
            </div>
          </div>
        )}

        {filteredCreated.length === 0 && filteredLiked.length === 0 && (
          <div className="py-20 text-center text-[#8d82a2]">
            {filter ? t('library.noMatches') : t('library.noPlaylists')}
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
});

export const Library = memo(() => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'playlists' | 'likes' | 'following'>('likes');
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);

  if (!user) return null;

  const tabs = [
    { id: 'playlists', label: t('search.playlists') },
    { id: 'likes', label: t('library.likedTracks') },
    { id: 'following', label: t('nav.following') },
  ] as const;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 py-6">
      <LibraryHero onTabLikes={() => setActiveTab('likes')} onTabPlaylists={() => setActiveTab('playlists')} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setFilter('');
                }}
                className={`rounded-full px-4 py-2 text-[12px] font-semibold transition-colors ${
                  active
                    ? 'bg-[#2f2442] text-white shadow-[0_12px_28px_rgba(53,40,77,0.18)]'
                    : 'border border-[#e6def1] bg-white text-[#7f7496] hover:text-[#34284b]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px] flex-1 max-w-[340px]">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <SearchIcon size={15} className="text-[#9388a8]" />
          </div>
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('library.filter')}
            className="w-full rounded-[18px] border border-[#ece5f6] bg-white px-10 py-3 text-[13px] text-[#2f2442] outline-none transition-colors focus:border-[#d7c9ec]"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute inset-y-0 right-3 flex items-center text-[#9d92b1] transition-colors hover:text-[#352a4d]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'likes' && <LikesTab filter={deferredFilter} />}
      {activeTab === 'following' && <FollowingTab filter={deferredFilter} />}
      {activeTab === 'playlists' && <PlaylistsTab filter={deferredFilter} />}
    </div>
  );
});
