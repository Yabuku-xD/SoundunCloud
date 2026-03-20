import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { api } from '../../lib/api';
import { invalidateAllLikesCache } from '../../lib/hooks';
import { Heart } from '../../lib/icons';
import { optimisticToggleLike, setLikedUrn, useLiked } from '../../lib/likes';
import type { Track } from '../../stores/player';

export const LikeButton = React.memo(function LikeButton({
  track,
  variant = 'inline',
  tone = 'dark',
}: {
  track: Track;
  variant?: 'overlay' | 'inline';
  tone?: 'dark' | 'light';
}) {
  const liked = useLiked(track.urn);
  const light = tone === 'light';

  // Seed from API data when available
  useEffect(() => {
    if (track.user_favorite) setLikedUrn(track.urn, true);
  }, [track.urn, track.user_favorite]);
  const qc = useQueryClient();

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !liked;
    optimisticToggleLike(qc, track, next);
    invalidateAllLikesCache();
    try {
      await api(`/likes/tracks/${encodeURIComponent(track.urn)}`, {
        method: next ? 'POST' : 'DELETE',
      });
    } catch {
      optimisticToggleLike(qc, track, !next);
    }
  };

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`cursor-pointer absolute top-2 left-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 ${
          liked
            ? 'bg-accent/80 text-white'
            : light
              ? 'bg-white/90 text-[#6f6387] hover:text-[#2f2442] hover:bg-white'
              : 'bg-black/50 text-white/80 hover:text-white hover:bg-black/70'
        }`}
      >
        <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 ${
        liked
          ? 'text-accent'
          : light
            ? 'text-[#9b91af] hover:bg-[#f3eef8] hover:text-[#3b2e55]'
            : 'text-white/20 hover:text-white/50'
      }`}
    >
      <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
    </button>
  );
});
