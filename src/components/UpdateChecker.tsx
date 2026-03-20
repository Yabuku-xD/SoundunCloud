import { fetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check, type Update as AvailableUpdate } from '@tauri-apps/plugin-updater';
import { useCallback, useMemo, useState } from 'react';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO } from '../lib/constants';
import { Download, Loader2, Sparkles, Trash2 } from '../lib/icons';

type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'installing' | 'handoff' | 'error';

interface ReleaseMetadata {
  version: string;
}

function releaseInstallerUrl(version: string) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/SoundunCloud_${version}_x64-setup.exe`;
}

function latestFeedUrl() {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/latest.json`;
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function statusLabel(status: UpdateStatus, nextVersion?: string, progress?: number | null) {
  if (status === 'checking') return 'Checking...';
  if (status === 'available') return `Install ${nextVersion}`;
  if (status === 'installing') {
    return `Installing${progress != null ? ` ${progress}%` : '...'}`;
  }
  if (status === 'handoff') return 'Installer opened';
  if (status === 'latest') return 'Up to date';
  if (status === 'error') return 'Try again';
  return 'Check updates';
}

async function fetchLatestReleaseVersion() {
  const response = await fetch(latestFeedUrl());
  if (!response.ok) {
    throw new Error(`Latest feed request failed with ${response.status}`);
  }

  const payload = (await response.json()) as ReleaseMetadata;
  if (!payload.version) {
    throw new Error('Latest feed did not include a version');
  }

  return payload.version;
}

export function SidebarUpdateCard({
  collapsed,
  tone = 'dark',
}: {
  collapsed: boolean;
  tone?: 'light' | 'dark';
}) {
  const light = tone === 'light';
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [fallbackVersion, setFallbackVersion] = useState<string | null>(null);

  const installerUrl = useMemo(() => releaseInstallerUrl(APP_VERSION), []);
  const nextVersion = availableUpdate?.version ?? fallbackVersion ?? undefined;

  const runCheck = useCallback(async () => {
    setStatus('checking');
    setProgress(null);
    setAvailableUpdate(null);
    setFallbackVersion(null);

    try {
      const update = await check();
      if (update) {
        setAvailableUpdate(update);
        setStatus('available');
        return;
      }

      const latestVersion = await fetchLatestReleaseVersion();
      if (compareVersions(latestVersion, APP_VERSION) > 0) {
        setFallbackVersion(latestVersion);
        setStatus('available');
        return;
      }

      setStatus('latest');
    } catch (error) {
      console.error('Update check failed:', error);

      try {
        const latestVersion = await fetchLatestReleaseVersion();
        if (compareVersions(latestVersion, APP_VERSION) > 0) {
          setFallbackVersion(latestVersion);
          setStatus('available');
          return;
        }

        setStatus('latest');
      } catch (fallbackError) {
        console.error('Fallback release check failed:', fallbackError);
        setStatus('error');
      }
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!availableUpdate && !fallbackVersion) {
      await runCheck();
      return;
    }

    if (!availableUpdate && fallbackVersion) {
      setStatus('handoff');
      await openUrl(releaseInstallerUrl(fallbackVersion));
      return;
    }

    let downloaded = 0;
    let total = 0;

    setStatus('installing');
    setProgress(0);

    try {
      await availableUpdate!.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          downloaded = 0;
          total = event.data.contentLength ?? 0;
          setProgress(0);
          return;
        }

        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
          return;
        }

        setProgress(100);
      });

      setStatus('handoff');
    } catch (error) {
      console.error('Update install failed:', error);

      if (availableUpdate?.version) {
        setFallbackVersion(availableUpdate.version);
      }

      setStatus('error');
      setProgress(null);
    }
  }, [availableUpdate, fallbackVersion, runCheck]);

  const primaryAction = nextVersion ? installUpdate : runCheck;
  const primaryDisabled = status === 'checking' || status === 'installing' || status === 'handoff';
  const primaryLabel = statusLabel(status, nextVersion, progress);
  const helper =
    status === 'available'
      ? `Version ${nextVersion} is ready`
      : status === 'handoff'
        ? 'Finish the install in the window that opened.'
        : status === 'latest'
          ? `You are on ${APP_VERSION}`
          : status === 'error'
            ? 'Update check failed. Use the installer below if needed.'
            : `Version ${APP_VERSION}`;

  if (collapsed) {
    return (
      <button
        type="button"
        title={primaryLabel}
        aria-label={primaryLabel}
        onClick={() => void primaryAction()}
        disabled={primaryDisabled}
        className={`mt-2 flex h-11 w-full items-center justify-center rounded-[18px] border transition-colors duration-200 disabled:cursor-default disabled:opacity-70 ${
          light
            ? 'border-[#e6def1] bg-white/70 text-[#6f6387] hover:bg-white hover:text-[#2f2442]'
            : 'border-white/[0.06] bg-white/[0.03] text-white/52 hover:bg-white/[0.06] hover:text-white/78'
        }`}
      >
        {status === 'checking' || status === 'installing' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} className={nextVersion ? 'text-accent' : undefined} />
        )}
      </button>
    );
  }

  return (
    <div
      className={`mt-2 rounded-[22px] border p-3 ${
        light
          ? 'border-[#e6def1] bg-white/72 shadow-[0_14px_40px_rgba(191,181,226,0.18)]'
          : 'border-white/[0.06] bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[14px] text-accent ${
            light ? 'bg-[#fff4ec]' : 'bg-accent/[0.12]'
          }`}
        >
          <Sparkles size={15} />
        </div>
        <div className="min-w-0">
          <p className={`text-[12px] font-semibold ${light ? 'text-[#2f2442]' : 'text-white/82'}`}>App</p>
          <p className={`text-[11px] ${light ? 'text-[#8c82a2]' : 'text-white/36'}`}>{helper}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void primaryAction()}
        disabled={primaryDisabled}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] px-3 py-3 text-[12px] font-semibold transition-colors duration-200 disabled:cursor-default disabled:opacity-70 ${
          light
            ? 'bg-[#2f2442] text-white hover:bg-[#241a36]'
            : 'bg-white/[0.08] text-white/82 hover:bg-white/[0.12]'
        }`}
      >
        {status === 'checking' || status === 'installing' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Sparkles size={14} className={nextVersion ? 'text-accent' : undefined} />
        )}
        <span>{primaryLabel}</span>
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void openUrl(installerUrl)}
          className={`flex items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-[11px] font-medium transition-colors duration-200 ${
            light
              ? 'border-[#e6def1] bg-white/70 text-[#6f6387] hover:bg-white hover:text-[#2f2442]'
              : 'border-white/[0.06] bg-white/[0.02] text-white/58 hover:bg-white/[0.06] hover:text-white/78'
          }`}
        >
          <Download size={13} />
          <span>Installer</span>
        </button>
        <button
          type="button"
          onClick={() => void openUrl('ms-settings:appsfeatures')}
          className={`flex items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-[11px] font-medium transition-colors duration-200 ${
            light
              ? 'border-[#e6def1] bg-white/70 text-[#6f6387] hover:bg-white hover:text-[#2f2442]'
              : 'border-white/[0.06] bg-white/[0.02] text-white/58 hover:bg-white/[0.06] hover:text-white/78'
          }`}
        >
          <Trash2 size={13} />
          <span>Uninstall</span>
        </button>
      </div>
    </div>
  );
}

export function UpdateChecker() {
  return null;
}
