interface SoundCloudWidgetSound {
  title?: string;
  artwork_url?: string;
  user?: {
    username?: string;
  };
}

interface SoundCloudWidgetProgress {
  currentPosition: number;
  loadProgress: number;
  relativePosition: number;
}

interface SoundCloudWidget {
  bind(eventName: string, listener: (payload: any) => void): void;
  load(url: string, options?: Record<string, string>): void;
  play(): void;
  pause(): void;
  getCurrentSound(callback: (sound: SoundCloudWidgetSound | null) => void): void;
  getDuration(callback: (duration: number) => void): void;
}

interface SoundCloudWidgetFactory {
  (element: HTMLIFrameElement): SoundCloudWidget;
  Events: {
    READY: string;
    PLAY: string;
    PAUSE: string;
    FINISH: string;
    PLAY_PROGRESS: string;
  };
}

interface Window {
  SC: {
    Widget: SoundCloudWidgetFactory;
  };
}
