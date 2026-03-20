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
        } catch {
          // polling stays silent; the next tick can recover
        }
      }, 1500);
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7f3fb_0%,#fdfbfd_46%,#f2eef8_100%)] px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(255,113,52,0.16),transparent_18%),radial-gradient(circle_at_82%_14%,rgba(210,198,240,0.34),transparent_22%)]" />

      <div className="relative w-full max-w-[880px] rounded-[36px] border border-[#e8e0f3] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_32px_100px_rgba(188,177,220,0.24)] backdrop-blur-xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <section className="rounded-[30px] border border-[#ece5f6] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,245,252,0.9))] p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#fff4ec] text-accent shadow-[0_12px_28px_rgba(255,113,52,0.16)]">
              <Disc3 size={24} strokeWidth={1.8} />
            </div>

            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#a194b8]">
              SoundCloud Desktop
            </p>
            <h1 className="mt-4 max-w-[10ch] text-[clamp(2.4rem,5vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.07em] text-[#2f2442]">
              Clean listening, without browser clutter.
            </h1>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-7 text-[#726788]">
              Sign in once and the app keeps your SoundCloud session, cached artwork, and native playback controls in one lighter desktop shell.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                'Faster artwork and queue loading',
                'Cleaner library and search flow',
                'Glass player with native controls',
              ].map((item, index) => (
                <div
                  key={item}
                  className="rounded-[22px] border border-[#ece5f6] bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(188,177,220,0.08)]"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ff6a1a]">
                    0{index + 1}
                  </p>
                  <p className="mt-3 text-[13px] font-semibold leading-6 text-[#352a4d]">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-[#ece5f6] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,243,252,0.92))] p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#a194b8]">
              Connect account
            </p>
            <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-[-0.06em] text-[#2f2442]">
              Link your SoundCloud session.
            </h2>
            <p className="mt-4 text-[14px] leading-7 text-[#776b8f]">
              The browser opens securely, then SoundunCloud drops you back into the app once the session is ready.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {['browser auth', 'native playback', 'cached library'].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#e9e1f4] bg-white px-3 py-2 text-[11px] font-semibold text-[#83779a]"
                >
                  {chip}
                </span>
              ))}
            </div>

            <div className="mt-8">
              {loading ? (
                <div className="space-y-4">
                  <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#eadff6] border-t-accent animate-spin" />
                  <p className="text-center text-[12px] text-[#85799b]">{t('auth.signingIn')}</p>

                  {authUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(authUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="mx-auto flex items-center justify-center gap-2 rounded-full border border-[#e9e1f4] bg-white px-4 py-2 text-[12px] font-medium text-[#6f6387] transition-colors duration-200 hover:text-[#2f2442]"
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
                  className="w-full rounded-[18px] bg-accent px-5 py-4 text-[14px] font-semibold text-white shadow-[0_18px_40px_rgba(255,113,52,0.26)] transition-colors duration-200 hover:bg-accent-hover"
                >
                  {t('auth.signIn')}
                </button>
              )}
            </div>

            <p className="mt-5 text-[11px] uppercase tracking-[0.24em] text-[#a194b8]">
              Browser auth. Native playback. Cleaner desktop shell.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
