import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Disc3, Minus, Search, Square, X } from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { Avatar } from '../ui/Avatar';

const NavButtons = React.memo(({ light }: { light: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';

  const buttonClass = `flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 ${
    light
      ? 'text-[#7f7596] hover:bg-white hover:text-[#322749]'
      : 'text-white/34 hover:bg-white/[0.08] hover:text-white/72'
  }`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Go back"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
        className={`${buttonClass} disabled:cursor-default disabled:opacity-30`}
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label="Go forward"
        onClick={() => navigate(1)}
        className={buttonClass}
      >
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
});

export const Titlebar = React.memo(({ tone = 'dark' }: { tone?: 'light' | 'dark' }) => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const light = tone === 'light';

  const minimize = () => getCurrentWindow().minimize();
  const toggleMaximize = () => getCurrentWindow().toggleMaximize();
  const close = () => getCurrentWindow().close();

  return (
    <div
      className={`relative z-20 flex h-14 shrink-0 items-center justify-between gap-4 rounded-[24px] px-4 ${
        light
          ? 'border border-[#e7def3] bg-[rgba(255,255,255,0.72)] shadow-[0_14px_44px_rgba(191,181,226,0.18)]'
          : 'border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,10,14,0.92),rgba(8,8,11,0.72))]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              light ? 'bg-[#fff4ec] text-accent' : 'bg-accent/[0.14] text-accent'
            }`}
          >
            <Disc3 size={15} strokeWidth={2} />
          </div>
          <span className={`text-[12px] font-semibold ${light ? 'text-[#362b4b]' : 'text-white/82'}`}>
            SoundunCloud
          </span>
        </div>
        <NavButtons light={light} />
      </div>

      <button
        type="button"
        onClick={() => navigate('/search')}
        className={`flex min-w-[260px] items-center gap-2 rounded-full px-4 py-2 text-left text-[12px] transition-colors duration-150 ${
          light
            ? 'border border-[#ece6f6] bg-white text-[#958aa9] hover:text-[#45365f]'
            : 'border border-white/[0.08] bg-white/[0.04] text-white/44 hover:text-white/68'
        }`}
      >
        <Search size={14} />
        <span>Search</span>
      </button>

      <div className="flex items-center gap-2">
        {user && !light && (
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 md:flex">
            <Avatar src={user.avatar_url} alt={user.username} size={24} />
            <span className="text-[12px] text-white/72">{user.username}</span>
          </div>
        )}

        {user && light && (
          <div className="hidden items-center gap-2 rounded-full bg-white px-2 py-1.5 shadow-[0_8px_20px_rgba(191,181,226,0.16)] md:flex">
            <Avatar src={user.avatar_url} alt={user.username} size={24} />
            <span className="text-[12px] text-[#43365e]">Hello, {user.username}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Minimize window"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 ${
              light
                ? 'text-[#8b82a0] hover:bg-white hover:text-[#322749]'
                : 'text-white/24 hover:bg-white/[0.08] hover:text-white/72'
            }`}
            onClick={minimize}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            aria-label="Maximize window"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 ${
              light
                ? 'text-[#8b82a0] hover:bg-white hover:text-[#322749]'
                : 'text-white/24 hover:bg-white/[0.08] hover:text-white/72'
            }`}
            onClick={toggleMaximize}
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            aria-label="Close window"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 ${
              light
                ? 'text-[#8b82a0] hover:bg-[#ffe8e7] hover:text-[#ab4b4b]'
                : 'text-white/24 hover:bg-red-500/14 hover:text-red-300'
            }`}
            onClick={close}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
});
