import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { AppShell } from './components/layout/AppShell';
import { ThemeProvider } from './components/ThemeProvider';
import { Login } from './pages/Login';
import { useAuthStore } from './stores/auth';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Search = lazy(() => import('./pages/Search').then((module) => ({ default: module.Search })));
const Library = lazy(() =>
  import('./pages/Library').then((module) => ({ default: module.Library })),
);
const TrackPage = lazy(() =>
  import('./pages/TrackPage').then((module) => ({ default: module.TrackPage })),
);
const PlaylistPage = lazy(() =>
  import('./pages/PlaylistPage').then((module) => ({ default: module.PlaylistPage })),
);
const UserPage = lazy(() =>
  import('./pages/UserPage').then((module) => ({ default: module.UserPage })),
);
const Settings = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings })),
);

function RouteLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6">
      <div className="rounded-full border border-[#e7def3] bg-white px-4 py-3 text-[12px] font-medium text-[#776b8f] shadow-[0_12px_34px_rgba(188,177,220,0.2)]">
        Loading view...
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, sessionId, fetchUser } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      sessionId: s.sessionId,
      fetchUser: s.fetchUser,
    })),
  );
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (sessionId) {
      fetchUser()
        .catch(() => useAuthStore.getState().logout())
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, [fetchUser, sessionId]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[linear-gradient(180deg,#f7f3fb_0%,#fdfbfd_42%,#f2eef8_100%)]">
        <div className="rounded-full border border-[#e7def3] bg-white p-4 shadow-[0_14px_40px_rgba(188,177,220,0.24)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Toaster
          theme="light"
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(231,223,243,1)',
              color: '#352a4d',
              fontSize: '13px',
              borderRadius: '20px',
              boxShadow: '0 16px 44px rgba(188,177,220,0.18)',
            },
          }}
        />
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="search" element={<Search />} />
              <Route path="library" element={<Library />} />
              <Route path="track/:urn" element={<TrackPage />} />
              <Route path="playlist/:urn" element={<PlaylistPage />} />
              <Route path="user/:urn" element={<UserPage />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
