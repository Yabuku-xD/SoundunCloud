import * as Dialog from '@radix-ui/react-dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentTime, getDuration, handlePrev, seek } from '../../lib/audio';
import { getWallpaperUrl } from '../../lib/cache';
import { art } from '../../lib/formatters';
import { useLyricsStore } from '../../stores/lyrics';
import { usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';
import { ArtworkPanel, LyricsPanel } from '../music/LyricsPanel';
import { QueuePanel } from '../music/QueuePanel';
import { NowPlayingBar } from './NowPlayingBar';
import { Sidebar } from './Sidebar';
import { Titlebar } from './Titlebar';

interface Keybinding {
  key: string;
  label: string;
  group: 'playback' | 'navigation' | 'panels';
  display: string;
}

const keybindings: Keybinding[] = [
  { key: ' ', label: 'kb.playPause', group: 'playback', display: 'Space' },
  { key: 'ArrowLeft', label: 'kb.seekBack', group: 'playback', display: '←' },
  { key: 'ArrowRight', label: 'kb.seekForward', group: 'playback', display: '→' },
  { key: 'n', label: 'kb.nextTrack', group: 'playback', display: 'N' },
  { key: 'p', label: 'kb.prevTrack', group: 'playback', display: 'P' },
  { key: 's', label: 'kb.shuffle', group: 'playback', display: 'S' },
  { key: 'r', label: 'kb.repeat', group: 'playback', display: 'R' },
  { key: 'ArrowUp', label: 'kb.volumeUp', group: 'playback', display: '↑' },
  { key: 'ArrowDown', label: 'kb.volumeDown', group: 'playback', display: '↓' },
  { key: 'm', label: 'kb.mute', group: 'playback', display: 'M' },
  { key: '/', label: 'kb.search', group: 'navigation', display: '/' },
  { key: 'Ctrl+K', label: 'kb.search', group: 'navigation', display: isMac() ? '⌘ K' : 'Ctrl K' },
  { key: 'q', label: 'kb.queue', group: 'panels', display: 'Q' },
  { key: 'l', label: 'kb.lyrics', group: 'panels', display: 'L' },
  { key: '[', label: 'kb.sidebar', group: 'panels', display: '[' },
  { key: 'Escape', label: 'kb.close', group: 'panels', display: 'Esc' },
  { key: 'Ctrl+/', label: 'kb.showBindings', group: 'panels', display: isMac() ? '⌘ /' : 'Ctrl /' },
];

function isMac() {
  return navigator.platform?.startsWith('Mac') || navigator.userAgent.includes('Mac');
}

const groupLabels = {
  playback: 'kb.groupPlayback',
  navigation: 'kb.groupNavigation',
  panels: 'kb.groupPanels',
} as const;

const KeyCap = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.08] px-1.5 h-[28px] font-mono text-[12px] font-semibold text-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]">
    {children}
  </kbd>
);

const KeybindingsDialog = React.memo(
  ({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) => {
    const { t } = useTranslation();

    const groups = (['playback', 'navigation', 'panels'] as const).map((group) => ({
      id: group,
      label: groupLabels[group],
      bindings: keybindings.filter((binding) => binding.group === group),
    }));

    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 z-[80] w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[#1a1a1e]/95 shadow-2xl backdrop-blur-2xl">
            <div className="border-b border-white/[0.06] px-7 pb-4 pt-6">
              <Dialog.Title className="text-[18px] font-bold tracking-tight text-white/90">
                {t('kb.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-white/30">
                {isMac() ? '⌘' : 'Ctrl'} + / {t('kb.toToggle')}
              </Dialog.Description>
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto px-7 py-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/30">
                    {t(group.label)}
                  </h3>
                  <div className="space-y-1">
                    {group.bindings.map((binding) => (
                      <div
                        key={binding.key}
                        className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className="text-[13px] text-white/60">{t(binding.label)}</span>
                        <div className="flex items-center gap-1">
                          {binding.display.split(' ').map((part, index) => (
                            <KeyCap key={index}>{part}</KeyCap>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-white/[0.06] px-7 py-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="cursor-pointer rounded-xl bg-white/[0.08] px-5 py-2 text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white"
                >
                  {t('kb.close')}
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);

const CustomBackground = React.memo(({ light }: { light: boolean }) => {
  const bgName = useSettingsStore((state) => state.backgroundImage);
  const bgOpacity = useSettingsStore((state) => state.backgroundOpacity);

  const bgUrl = bgName ? getWallpaperUrl(bgName) : null;
  if (!bgUrl || light) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
      style={{
        backgroundImage: `url(${bgUrl})`,
        opacity: bgOpacity,
      }}
    />
  );
});

const AmbientGlow = React.memo(({ light }: { light: boolean }) => {
  const artwork = usePlayerStore((state) => art(state.currentTrack?.artwork_url, 't500x500'));
  if (!artwork) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 transition-all duration-700 ease-out ${
        light ? 'h-[260px] opacity-[0.08] blur-[88px]' : 'h-[240px] opacity-[0.03] blur-[56px]'
      }`}
      style={{
        backgroundImage: `url(${artwork})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        contain: 'strict',
        transform: 'translateZ(0)',
      }}
    />
  );
});

const StableOutlet = React.memo(() => <Outlet />);

const isInputEl = (element: EventTarget | null) =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLElement && element.isContentEditable);

export const AppShell = React.memo(() => {
  const [queueOpen, setQueueOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const lightChrome = location.pathname === '/';

  const onQueueToggle = useCallback(() => setQueueOpen((value) => !value), []);
  const onQueueClose = useCallback(() => setQueueOpen(false), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const inInput = isInputEl(event.target);
      const code = event.code;

      if ((event.key === '/' || code === 'Slash') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setKbOpen((value) => !value);
        return;
      }

      if (code === 'KeyK' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        navigate('/search');
        return;
      }

      if ((event.key === '/' || code === 'Slash') && !inInput) {
        event.preventDefault();
        navigate('/search');
        return;
      }

      if (inInput) return;

      const player = usePlayerStore.getState();

      switch (code) {
        case 'Space':
          event.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          seek(Math.min(getCurrentTime() + 5, getDuration()));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seek(Math.max(getCurrentTime() - 5, 0));
          break;
        case 'ArrowUp':
          event.preventDefault();
          player.setVolume(usePlayerStore.getState().volume + 5);
          break;
        case 'ArrowDown':
          event.preventDefault();
          player.setVolume(usePlayerStore.getState().volume - 5);
          break;
        case 'KeyM': {
          const { volume, volumeBeforeMute } = usePlayerStore.getState();
          player.setVolume(volume > 0 ? 0 : volumeBeforeMute);
          break;
        }
        case 'KeyN':
          player.next();
          break;
        case 'KeyP':
          handlePrev();
          break;
        case 'KeyS':
          player.toggleShuffle();
          break;
        case 'KeyR':
          player.toggleRepeat();
          break;
        case 'KeyL':
          useLyricsStore.getState().toggle();
          break;
        case 'KeyQ':
          setQueueOpen((value) => !value);
          break;
        case 'BracketLeft':
          useSettingsStore.getState().toggleSidebar();
          break;
        case 'Escape':
          if (kbOpen) {
            setKbOpen(false);
            break;
          }
          if (useLyricsStore.getState().open) useLyricsStore.getState().close();
          else if (queueOpen) setQueueOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kbOpen, navigate, queueOpen]);

  return (
    <div
      className={`relative flex h-screen overflow-hidden ${
        lightChrome
          ? 'bg-[linear-gradient(180deg,#f3f0fb_0%,#f8f6fc_40%,#f2eef9_100%)]'
          : 'bg-[linear-gradient(180deg,#0a0b10_0%,#08090d_100%)]'
      }`}
    >
      {lightChrome && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,138,76,0.18),transparent_18%),radial-gradient(circle_at_82%_18%,rgba(186,177,242,0.26),transparent_22%)]" />
      )}
      {!lightChrome && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,106,26,0.05),transparent_60%)]" />
      )}
      <CustomBackground light={lightChrome} />
      <AmbientGlow light={lightChrome} />

      <div className="relative z-10 flex min-h-0 flex-1 gap-4 p-4">
        <Sidebar tone={lightChrome ? 'light' : 'dark'} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Titlebar tone={lightChrome ? 'light' : 'dark'} />
          <main
            className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[34px] ${
              lightChrome
                ? 'border border-[#e8e1f5] bg-[rgba(255,255,255,0.78)] shadow-[0_24px_80px_rgba(188,177,220,0.26)]'
                : 'bg-transparent'
            }`}
          >
            <StableOutlet />
          </main>
          <NowPlayingBar onQueueToggle={onQueueToggle} queueOpen={queueOpen} tone={lightChrome ? 'light' : 'dark'} />
        </div>
      </div>

      <QueuePanel open={queueOpen} onClose={onQueueClose} />
      <LyricsPanel />
      <ArtworkPanel />
      <KeybindingsDialog open={kbOpen} onOpenChange={setKbOpen} />
    </div>
  );
});
