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
      }, 1500);
    } catch (e) {
      console.error('Login failed:', e);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,106,26,0.1),transparent_24%)]" />

      <div className="glass w-full max-w-[400px] rounded-[28px] p-8 text-center">
        <div className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-[20px] border border-white/[0.08] bg-white/[0.04] text-accent shadow-[0_0_24px_var(--color-accent-glow)]">
          <Disc3 size={28} strokeWidth={1.7} />
        </div>

        <h1 className="mt-5 text-[32px] font-bold tracking-[-0.05em] text-white/94">
          SoundunCloud
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-white/44">Sign in once. Stay in flow.</p>

        <div className="mt-8">
          {loading ? (
            <div className="space-y-4">
              <div className="mx-auto h-9 w-9 rounded-full border-2 border-white/[0.08] border-t-accent animate-spin" />
              <p className="text-[12px] text-white/46">{t('auth.signingIn')}</p>

              {authUrl && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(authUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="mx-auto flex items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
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
              className="w-full rounded-[18px] bg-accent px-5 py-4 text-[14px] font-semibold text-white shadow-[0_0_34px_var(--color-accent-glow)] transition-colors duration-200 hover:bg-accent-hover"
            >
              {t('auth.signIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
