import type { ClipboardEvent, KeyboardEvent } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AddToPlaylistDialog } from '../components/music/AddToPlaylistDialog';
import { LikeButton } from '../components/music/LikeButton';
import { PlaylistCard } from '../components/music/PlaylistCard';
import { AppImage } from '../components/ui/AppImage';
import { api } from '../lib/api';
import { preloadTrack } from '../lib/audio';
import { art, dur, fc } from '../lib/formatters';
import {
  type SCUser,
  useInfiniteScroll,
  useSearchPlaylists,
  useSearchTracks,
  useSearchUsers,
} from '../lib/hooks';
import {
  ExternalLink,
  headphones11,
  heart11,
  ListPlus,
  Loader2,
  Music,
  Pause,
  Play,
  Search as SearchIcon,
  Users,
  X,
} from '../lib/icons';
import { useTrackPlay } from '../lib/useTrackPlay';
import type { Track } from '../stores/player';

const panel =
  'rounded-[30px] border border-[#e8e1f3] bg-white/[0.88] shadow-[0_18px_46px_rgba(188,177,220,0.12)]';

const rowBase =
  'group flex items-center gap-4 rounded-[22px] border border-[#eee8f6] bg-[#fbf9fd] px-4 py-3 transition-colors duration-200 hover:bg-white';

const SC_URL_RE = /^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\/.+/i;

function isSoundCloudUrl(input: string) {
  return SC_URL_RE.test(input.trim());
}

function TrackRow({ track, queue }: { track: Track; queue: Track[] }) {
  const navigate = useNavigate();
  const { isThis, isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const cover = art(track.artwork_url, 't200x200');

  return (
    <div
      className={`${rowBase} ${isThis ? 'ring-1 ring-[#e6d6ff] bg-white' : ''}`}
      onMouseEnter={() => preloadTrack(track.urn)}
    >
      <button
        type="button"
        onClick={togglePlay}
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
          >
            <ListPlus size={14} />
          </button>
        </AddToPlaylistDialog>
      </div>

      <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-[#a094b6]">
        {dur(track.duration)}
      </span>
    </div>
  );
}

function UserCard({ user }: { user: SCUser }) {
  const navigate = useNavigate();
  const avatar = art(user.avatar_url, 't300x300');

  return (
    <button
      type="button"
      onClick={() => navigate(`/user/${encodeURIComponent(user.urn)}`)}
      className="rounded-[26px] border border-[#ece5f6] bg-white p-5 text-left shadow-[0_12px_28px_rgba(188,177,220,0.1)] transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-[#f2ecf8]">
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
            <Users size={24} className="text-[#a89dbc]" />
          </div>
        )}
      </div>
      <p className="mt-4 truncate text-[15px] font-semibold text-[#2f2442]">{user.username}</p>
      <p className="mt-1 text-[11px] text-[#8f84a6]">{fc(user.followers_count)} followers</p>
    </button>
  );
}

function ResolveCard({ url, onDone }: { url: string; onDone: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    api<{ kind: string; urn: string }>(`/resolve?url=${encodeURIComponent(url.trim())}`)
      .then((res) => {
        if (cancelled) return;
        setState('success');
        if (res.kind === 'track') navigate(`/track/${encodeURIComponent(res.urn)}`);
        else if (res.kind === 'playlist' || res.kind === 'system-playlist') navigate(`/playlist/${encodeURIComponent(res.urn)}`);
        else if (res.kind === 'user') navigate(`/user/${encodeURIComponent(res.urn)}`);
        else {
          setErrorMsg(`Unknown resource: ${res.kind}`);
          setState('error');
        }
        onDone();
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMsg(error?.body ? 'Link not found' : 'Failed to resolve');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, onDone, url]);

  return (
    <div className={`${panel} mx-auto mt-10 max-w-lg p-5`}>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fff4ec] text-accent">
          <ExternalLink size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#2f2442]">
            {state === 'loading' ? 'Resolving link...' : state === 'error' ? 'Could not resolve' : 'Redirecting...'}
          </p>
          <p className="mt-1 truncate text-[11px] text-[#8d82a2]">{url.trim()}</p>
        </div>
        {state === 'loading' && <Loader2 size={18} className="animate-spin text-accent" />}
      </div>
      {state === 'error' && <p className="mt-3 pl-16 text-[12px] text-[#c06a53]">{errorMsg}</p>}
    </div>
  );
}

function SearchTracksTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const tracksQuery = useSearchTracks(query);
  const uniqueTracks = useMemo(
    () => Array.from(new Map(tracksQuery.tracks.map((track) => [track.urn, track])).values()),
    [tracksQuery.tracks],
  );
  const sentinelRef = useInfiniteScroll(
    !!tracksQuery.hasNextPage,
    !!tracksQuery.isFetchingNextPage,
    tracksQuery.fetchNextPage,
  );

  return (
    <section className={`${panel} p-5`}>
      {tracksQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#b4a9c6]" />
        </div>
      ) : uniqueTracks.length === 0 ? (
        <div className="py-20 text-center text-[#8d82a2]">{t('search.noResults')}</div>
      ) : (
        <div className="space-y-2">
          {uniqueTracks.map((track) => (
            <TrackRow key={track.urn} track={track} queue={uniqueTracks} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {tracksQuery.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
}

function SearchPlaylistsTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const playlistsQuery = useSearchPlaylists(query);
  const uniquePlaylists = useMemo(
    () => Array.from(new Map(playlistsQuery.playlists.map((playlist) => [playlist.urn, playlist])).values()),
    [playlistsQuery.playlists],
  );
  const sentinelRef = useInfiniteScroll(
    !!playlistsQuery.hasNextPage,
    !!playlistsQuery.isFetchingNextPage,
    playlistsQuery.fetchNextPage,
  );

  return (
    <section className={`${panel} p-5`}>
      {playlistsQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#b4a9c6]" />
        </div>
      ) : uniquePlaylists.length === 0 ? (
        <div className="py-20 text-center text-[#8d82a2]">{t('search.noResults')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {uniquePlaylists.map((playlist) => (
            <PlaylistCard key={playlist.urn} playlist={playlist} tone="light" />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {playlistsQuery.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
}

function SearchUsersTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const usersQuery = useSearchUsers(query);
  const uniqueUsers = useMemo(
    () => Array.from(new Map(usersQuery.users.map((user) => [user.urn, user])).values()),
    [usersQuery.users],
  );
  const sentinelRef = useInfiniteScroll(
    !!usersQuery.hasNextPage,
    !!usersQuery.isFetchingNextPage,
    usersQuery.fetchNextPage,
  );

  return (
    <section className={`${panel} p-5`}>
      {usersQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#b4a9c6]" />
        </div>
      ) : uniqueUsers.length === 0 ? (
        <div className="py-20 text-center text-[#8d82a2]">{t('search.noResults')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {uniqueUsers.map((user) => (
            <UserCard key={user.urn} user={user} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="mt-6 flex h-16 items-center justify-center">
        {usersQuery.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-[#b4a9c6]" />}
      </div>
    </section>
  );
}

function SearchEmpty() {
  return (
    <section className={`${panel} flex h-[360px] flex-col items-center justify-center text-center`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f4eef9] text-[#8e84a5]">
        <SearchIcon size={24} />
      </div>
      <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.04em] text-[#2f2442]">Search your library and SoundCloud.</h3>
      <p className="mt-3 max-w-[40ch] text-[13px] leading-6 text-[#8d82a2]">
        Look up tracks, playlists, or artists. You can also paste a SoundCloud link and jump straight to it.
      </p>
    </section>
  );
}

export const Search = memo(() => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists' | 'users'>('tracks');
  const [resolveUrl, setResolveUrl] = useState<string | null>(null);

  const isUrl = isSoundCloudUrl(inputValue);

  useEffect(() => {
    if (isUrl) {
      setDebouncedQuery('');
      return;
    }

    setResolveUrl(null);
    const handler = setTimeout(() => setDebouncedQuery(inputValue), 350);
    return () => clearTimeout(handler);
  }, [inputValue, isUrl]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && isUrl) {
      setResolveUrl(inputValue.trim());
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (isSoundCloudUrl(pasted)) {
      event.preventDefault();
      setInputValue(pasted);
      setResolveUrl(pasted.trim());
    }
  };

  const tabs = [
    { id: 'tracks', label: t('search.tracks') },
    { id: 'playlists', label: t('search.playlists') },
    { id: 'users', label: t('search.users') },
  ] as const;

  return (
    <div className="mx-auto flex max-w-[1220px] flex-col gap-6 px-6 py-6">
      <section className="rounded-[34px] border border-[#e8e1f3] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,244,252,0.92))] px-7 py-7 shadow-[0_20px_60px_rgba(188,177,220,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a194b8]">
          Search
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
              {isUrl ? <ExternalLink size={18} className="text-accent" /> : <SearchIcon size={18} className="text-[#9388a8]" />}
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t('search.placeholder')}
              className={`w-full rounded-[20px] border bg-white px-12 py-4 text-[15px] text-[#2f2442] outline-none transition-colors ${
                isUrl
                  ? 'border-[#ffd6c2] ring-2 ring-[#fff1e8]'
                  : 'border-[#ece5f6] focus:border-[#d7c9ec]'
              }`}
              autoFocus
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setResolveUrl(null);
                }}
                className="absolute inset-y-0 right-4 flex items-center text-[#9d92b1] transition-colors hover:text-[#352a4d]"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="rounded-[24px] border border-[#ece5f6] bg-white/72 px-5 py-4 text-[12px] text-[#8d82a2]">
            Paste any SoundCloud link and press Enter to jump straight into it.
          </div>
        </div>
      </section>

      {debouncedQuery && (
        <div className="flex items-center gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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
      )}

      {resolveUrl && (
        <ResolveCard
          url={resolveUrl}
          onDone={() => {
            setInputValue('');
            setResolveUrl(null);
          }}
        />
      )}

      {!resolveUrl && !debouncedQuery && <SearchEmpty />}
      {!resolveUrl && debouncedQuery && activeTab === 'tracks' && <SearchTracksTab query={debouncedQuery} />}
      {!resolveUrl && debouncedQuery && activeTab === 'playlists' && <SearchPlaylistsTab query={debouncedQuery} />}
      {!resolveUrl && debouncedQuery && activeTab === 'users' && <SearchUsersTab query={debouncedQuery} />}
    </div>
  );
});
