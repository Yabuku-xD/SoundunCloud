import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Disc3, Minus, Square, X } from '../../lib/icons';

function routeLabel(pathname: string) {
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/library')) return 'Library';
  if (pathname.startsWith('/track')) return 'Track';
  if (pathname.startsWith('/playlist')) return 'Playlist';
  if (pathname.startsWith('/user')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Home';
}

const NavButtons = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">
      <button
        type="button"
        aria-label="Go back"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/34 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/72 disabled:cursor-default disabled:opacity-25"
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label="Go forward"
        onClick={() => navigate(1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/34 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/72"
      >
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
});

export const Titlebar = React.memo(() => {
  const location = useLocation();
  const minimize = () => getCurrentWindow().minimize();
  const toggleMaximize = () => getCurrentWindow().toggleMaximize();
  const close = () => getCurrentWindow().close();
  const activeLabel = routeLabel(location.pathname);

  return (
    <div className="relative z-20 h-14 shrink-0 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(11,12,17,0.94),rgba(9,10,14,0.7))] px-4">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="surface-panel-muted flex items-center gap-3 rounded-full px-3 py-2"
            data-tauri-drag-region
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/[0.14] text-accent shadow-[0_0_18px_var(--color-accent-glow)]">
              <Disc3 size={15} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">SoundunCloud</p>
              <p className="truncate text-[12px] font-semibold text-white/86">Desktop Relay</p>
            </div>
          </div>

          <NavButtons />

          <div
            className="surface-panel-muted hidden items-center gap-3 rounded-full px-3 py-2 md:flex"
            data-tauri-drag-region
          >
            <span className="section-index">/LIVE</span>
            <span className="text-[12px] font-medium text-white/74">{activeLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="surface-panel-muted hidden items-center gap-2 rounded-full px-3 py-2 lg:flex"
            data-tauri-drag-region
          >
            <span className="eyebrow">Playback</span>
            <span className="text-[12px] font-medium text-white/68">Native Cache Online</span>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">
            <button
              type="button"
              aria-label="Minimize window"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/24 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/72"
              onClick={minimize}
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              aria-label="Maximize window"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/24 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/72"
              onClick={toggleMaximize}
            >
              <Square size={10} />
            </button>
            <button
              type="button"
              aria-label="Close window"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/24 transition-colors duration-150 hover:bg-red-500/14 hover:text-red-300"
              onClick={close}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
