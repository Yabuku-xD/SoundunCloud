import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { clearAssetsCache, clearCache, getAssetsCacheSize, getCacheSize } from '../lib/cache';
import { Loader2, Trash2 } from '../lib/icons';
import { useAuthStore } from '../stores/auth';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-[#e8e1f3] bg-white/[0.88] p-6 shadow-[0_16px_40px_rgba(188,177,220,0.12)]">
      <div className="mb-5">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#2f2442]">{title}</h2>
        <p className="mt-1 text-[13px] text-[#8d82a2]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function CacheRow({
  label,
  size,
  clearing,
  onClear,
}: {
  label: string;
  size: number | null;
  clearing: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[#eee8f6] bg-[#faf8fd] px-4 py-4">
      <div>
        <p className="text-[13px] font-semibold text-[#352a4d]">{label}</p>
        <p className="mt-1 text-[12px] text-[#8d82a2]">
          {size === null ? 'Calculating…' : formatBytes(size)}
        </p>
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={clearing || size === 0}
        className="flex items-center gap-2 rounded-[16px] border border-[#f2c8bf] bg-[#fff3f0] px-4 py-2.5 text-[12px] font-semibold text-[#b85f49] transition-colors hover:bg-[#ffeae5] disabled:cursor-default disabled:opacity-40"
      >
        {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        <span>Clear</span>
      </button>
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const [audioSize, setAudioSize] = useState<number | null>(null);
  const [assetsSize, setAssetsSize] = useState<number | null>(null);
  const [clearingAudio, setClearingAudio] = useState(false);
  const [clearingAssets, setClearingAssets] = useState(false);

  useEffect(() => {
    getCacheSize().then(setAudioSize);
    getAssetsCacheSize().then(setAssetsSize);
  }, []);

  const handleClearAudio = useCallback(async () => {
    setClearingAudio(true);
    try {
      await clearCache();
      setAudioSize(0);
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingAudio(false);
    }
  }, [t]);

  const handleClearAssets = useCallback(async () => {
    setClearingAssets(true);
    try {
      await clearAssetsCache();
      setAssetsSize(0);
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingAssets(false);
    }
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-6 py-6">
      <section className="rounded-[34px] border border-[#e8e1f3] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,244,252,0.92))] px-7 py-7 shadow-[0_20px_60px_rgba(188,177,220,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a194b8]">
          App settings
        </p>
        <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.4rem)] font-bold tracking-[-0.07em] text-[#2f2442]">
          Keep it simple.
        </h1>
        <p className="mt-3 max-w-[54ch] text-[14px] leading-7 text-[#7e7394]">
          Cache management and account controls only. The extra language, wallpaper, accent, and output-device toggles have been removed.
        </p>
      </section>

      <Card title={t('settings.cache')} subtitle="Clear old audio and artwork files without touching your account.">
        <div className="space-y-3">
          <CacheRow
            label={t('settings.audioCacheSize')}
            size={audioSize}
            clearing={clearingAudio}
            onClear={handleClearAudio}
          />
          <CacheRow
            label={t('settings.assetsCacheSize')}
            size={assetsSize}
            clearing={clearingAssets}
            onClear={handleClearAssets}
          />
        </div>
      </Card>

      <Card title={t('settings.account')} subtitle="Sign out of this desktop session when you want a fresh start.">
        <button
          type="button"
          onClick={logout}
          className="rounded-[16px] border border-[#f2c8bf] bg-[#fff3f0] px-5 py-3 text-[13px] font-semibold text-[#b85f49] transition-colors hover:bg-[#ffeae5]"
        >
          {t('auth.signOut')}
        </button>
      </Card>
    </div>
  );
}
