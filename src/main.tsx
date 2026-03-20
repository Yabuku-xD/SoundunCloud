import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setServerPorts } from './lib/constants';
import './lib/audio';
import './lib/discord';
import './lib/tray';
import './lib/scproxy';
import './index.css';

if (import.meta.env.DEV) {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/react-scan/dist/auto.global.js';
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

async function registerServiceWorker(proxyPort: number) {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`/sw.js?port=${proxyPort}`);
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  } catch (e) {
    console.warn('[SW] Registration failed, running without proxy SW:', e);
  }
}

async function bootstrap() {
  const [staticPort, proxyPort] = await invoke<[number, number]>('get_server_ports');
  setServerPorts(staticPort, proxyPort);

  await registerServiceWorker(proxyPort);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
