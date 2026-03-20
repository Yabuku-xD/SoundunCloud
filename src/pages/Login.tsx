import { fetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { API_BASE } from '../lib/constants';
import { Check, ClipboardCopy, Disc3 } from '../lib/icons';
import { queryClient } from '../main';
import { useAuthStore } from '../stores/auth';

interface LoginResponse {
  url: string;
  sessionId: string;
}

interface SessionResponse {
  authenticated: boolean;
}

const featureLines = [
  'Faster artwork + smarter cache',
  'Native playback instead of a web shell',
  'Cleaner library, search, and player flow',
];

export function Login() {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLogin = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setLoading(true);

    try {
      const { url, sessionId } = await api<LoginResponse>('/auth/login');
      setAuthUrl(url);
      await openUrl(url);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/session`, {
            headers: { 'x-session-id': sessionId },
          });
          const data: SessionResponse = await res.json();

          if (data.authenticated) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSession(sessionId);
            await fetchUser();
            queryClient.invalidateQueries();
          }
        } catch {}
      }, 2000);
    } catch (e) {
      console.error('Login failed:', e);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden px-6 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,106,26,0.14),transparent_28%),radial-gradient(circle_at_80%_16%,rgba(76,173,255,0.14),transparent_26%),radial-gradient(circle_at_50%_70%,rgba(255,255,255,0.04),transparent_34%)]" />

      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="section-frame flex min-h-[520px] flex-col justify-between p-8 lg:p-10">
          <div>
            <p className="eyebrow">Desktop Rebuild</p>
            <div className="mt-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/[0.08] bg-white/[0.04] text-accent shadow-[0_0_40px_var(--color-accent-glow)]">
              <Disc3 size={28} strokeWidth={1.7} />
            </div>

            <h1 className="mt-8 max-w-xl text-[clamp(2.5rem,4vw,4.75rem)] font-bold leading-[0.92] tracking-[-0.04em] text-balance">
              SoundCloud, rebuilt into a real desktop listening surface.
            </h1>

            <p className="mt-5 max-w-lg text-[15px] leading-7 text-white/54">
              Sign in once and the app handles the rest with a native shell, faster media
              caching, and a layout that feels intentional instead of browser-shaped.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {featureLines.map((line, index) => (
              <div key={line} className="surface-panel-muted rounded-[24px] p-4">
                <p className="section-index">0{index + 1}</p>
                <p className="mt-3 text-[14px] font-medium leading-6 text-white/82">{line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel flex min-h-[520px] flex-col justify-between rounded-[32px] p-8 lg:p-10">
          <div>
            <p className="eyebrow">Connect Account</p>
            <h2 className="mt-4 text-[34px] font-bold tracking-[-0.04em] text-balance">
              Link your SoundCloud session.
            </h2>
            <p className="mt-4 max-w-md text-[14px] leading-7 text-white/50">
              We open the secure SoundCloud auth flow in your browser, then drop you back into the
              native app when your session is ready.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="command-chip">authenticate</span>
              <span className="command-chip">sync</span>
              <span className="command-chip">listen</span>
            </div>

            {loading ? (
              <div className="space-y-4 rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border-2 border-white/[0.08] border-t-accent animate-spin" />
                  <div>
                    <p className="text-[14px] font-semibold text-white/88">{t('auth.signingIn')}</p>
                    <p className="mt-1 text-[12px] text-white/40">
                      Waiting for SoundCloud to confirm the session.
                    </p>
                  </div>
                </div>

                {authUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(authUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[12px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check size={13} />
                        {t('auth.copied')}
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={13} />
                        {t('auth.copyLink')}
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLogin}
                className="w-full rounded-[20px] bg-accent px-5 py-4 text-[14px] font-semibold text-white shadow-[0_0_44px_var(--color-accent-glow)] transition-colors duration-200 hover:bg-accent-hover"
              >
                {t('auth.signIn')}
              </button>
            )}

            <p className="text-[11px] uppercase tracking-[0.24em] text-white/28">
              Browser auth. Native playback. Cached locally after connect.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
