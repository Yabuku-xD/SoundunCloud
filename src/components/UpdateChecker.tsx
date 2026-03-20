import { check, type Update as AvailableUpdate } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useState } from 'react';
import i18n from '../i18n';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO } from '../lib/constants';
import { Download, Loader2, Sparkles, Trash2 } from '../lib/icons';

type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'installing' | 'handoff' | 'error';

function releaseInstallerUrl(version: string) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/SoundunCloud_${version}_x64-setup.exe`;
}

function statusLabel(
  status: UpdateStatus,
  isRu: boolean,
  nextVersion?: string,
  progress?: number | null,
) {
  if (status === 'checking') return isRu ? 'Проверка...' : 'Checking...';
  if (status === 'available') return isRu ? `Установить ${nextVersion}` : `Install ${nextVersion}`;
  if (status === 'installing') {
    return isRu
      ? `Установка${progress != null ? ` ${progress}%` : '...'}`
      : `Installing${progress != null ? ` ${progress}%` : '...'}`;
  }
  if (status === 'handoff') return isRu ? 'Установщик открыт' : 'Installer opened';
  if (status === 'latest') return isRu ? 'Актуальная версия' : 'Up to date';
  if (status === 'error') return isRu ? 'Повторить' : 'Retry';
  return isRu ? 'Проверить обновления' : 'Check updates';
}

export function SidebarUpdateCard({ collapsed }: { collapsed: boolean }) {
  const isRu = i18n.language?.startsWith('ru');
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  const installerUrl = useMemo(() => releaseInstallerUrl(APP_VERSION), []);

  const runCheck = useCallback(async () => {
    setStatus('checking');
    setProgress(null);
    try {
      const update = await check();
      setAvailableUpdate(update);
      setStatus(update ? 'available' : 'latest');
    } catch (error) {
      console.error('Update check failed:', error);
      setAvailableUpdate(null);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const installUpdate = useCallback(async () => {
    if (!availableUpdate) {
      await runCheck();
      return;
    }

    let downloaded = 0;
    let total = 0;

    setStatus('installing');
    setProgress(0);

    try {
      await availableUpdate.downloadAndInstall((event) => {
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
      setStatus('error');
      setProgress(null);
    }
  }, [availableUpdate, runCheck]);

  const primaryAction = availableUpdate ? installUpdate : runCheck;
  const primaryDisabled = status === 'checking' || status === 'installing' || status === 'handoff';
  const primaryLabel = statusLabel(status, isRu, availableUpdate?.version, progress);
  const helper =
    status === 'available'
      ? isRu
        ? `Доступна версия ${availableUpdate?.version}`
        : `Version ${availableUpdate?.version} is ready`
      : status === 'handoff'
        ? isRu
          ? 'Завершите установку в открывшемся окне.'
          : 'Finish the install in the window that opened.'
        : status === 'error'
          ? isRu
            ? 'Обновление не удалось проверить.'
            : 'Update check did not finish.'
          : isRu
            ? `Версия ${APP_VERSION}`
            : `Version ${APP_VERSION}`;

  if (collapsed) {
    return (
      <button
        type="button"
        title={primaryLabel}
        aria-label={primaryLabel}
        onClick={() => void primaryAction()}
        disabled={primaryDisabled}
        className="mt-2 flex h-11 w-full items-center justify-center rounded-[18px] border border-white/[0.06] bg-white/[0.03] text-white/52 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white/78 disabled:cursor-default disabled:opacity-70"
      >
        {status === 'checking' || status === 'installing' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} className={availableUpdate ? 'text-accent' : undefined} />
        )}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-[22px] border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-accent/[0.12] text-accent">
          <Sparkles size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white/82">App</p>
          <p className="text-[11px] text-white/36">{helper}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void primaryAction()}
        disabled={primaryDisabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] bg-white/[0.08] px-3 py-3 text-[12px] font-semibold text-white/82 transition-colors duration-200 hover:bg-white/[0.12] disabled:cursor-default disabled:opacity-70"
      >
        {status === 'checking' || status === 'installing' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Sparkles size={14} className={availableUpdate ? 'text-accent' : undefined} />
        )}
        <span>{primaryLabel}</span>
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void openUrl(installerUrl)}
          className="flex items-center justify-center gap-1.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11px] font-medium text-white/58 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white/78"
        >
          <Download size={13} />
          <span>{isRu ? 'Установщик' : 'Installer'}</span>
        </button>
        <button
          type="button"
          onClick={() => void openUrl('ms-settings:appsfeatures')}
          className="flex items-center justify-center gap-1.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11px] font-medium text-white/58 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white/78"
        >
          <Trash2 size={13} />
          <span>{isRu ? 'Удалить' : 'Uninstall'}</span>
        </button>
      </div>
    </div>
  );
}

export function UpdateChecker() {
  return null;
}
