import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { AppShell } from './components/layout/AppShell';
import { ThemeProvider } from './components/ThemeProvider';
import { UpdateChecker } from './components/UpdateChecker';
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
      <div className="surface-panel rounded-full px-4 py-3 text-[12px] font-medium text-white/58">
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
      <div className="flex h-screen items-center justify-center">
        <div className="surface-panel rounded-full p-4">
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
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background:
                'linear-gradient(180deg, rgba(28,28,35,0.96), rgba(17,18,24,0.92))',
              backdropFilter: 'blur(28px)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: '13px',
              borderRadius: '20px',
            },
          }}
        />
        <UpdateChecker />
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
