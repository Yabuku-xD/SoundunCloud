import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Disc3, Minus, Square, X } from '../../lib/icons';

const NavButtons = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';

  return (
    <div className="flex items-center gap-1">
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
  const minimize = () => getCurrentWindow().minimize();
  const toggleMaximize = () => getCurrentWindow().toggleMaximize();
  const close = () => getCurrentWindow().close();

  return (
    <div className="relative z-20 h-12 shrink-0 border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,10,14,0.92),rgba(8,8,11,0.72))] px-4">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/[0.14] text-accent">
              <Disc3 size={14} strokeWidth={2} />
            </div>
            <span className="text-[12px] font-semibold text-white/82">SoundunCloud</span>
          </div>
          <NavButtons />
        </div>

        <div className="flex items-center gap-1">
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
  );
});
