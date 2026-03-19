export type LibraryTone = "ember" | "ocean" | "jade" | "rose" | "gold" | "sky";
export type SoundCloudKind = "track" | "playlist" | "profile";

export interface LibraryItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  kind: SoundCloudKind;
  source: "starter" | "custom";
  tags: string[];
  tone: LibraryTone;
  url: string;
  thumbnailUrl?: string;
}

export interface SoundCloudOEmbed {
  title: string;
  authorName: string;
  thumbnailUrl?: string;
  kind: SoundCloudKind;
  tone: LibraryTone;
}

export interface PlaybackSnapshot {
  title: string;
  author: string;
  durationMs: number;
  positionMs: number;
  artworkUrl?: string;
}

export interface DesktopContext {
  appName: string;
  version: string;
  platformLabel: string;
  arch: string;
  buildProfile: string;
}

export interface AppFeedback {
  tone: "success" | "error" | "info";
  message: string;
}

export interface AuthenticatedUser {
  username: string;
  fullName?: string | null;
  permalinkUrl?: string | null;
  avatarUrl?: string | null;
}

export interface SoundunCloudSnapshot {
  desktopContext: DesktopContext;
  oauthConfigured: boolean;
  redirectUri: string;
  hasLocalSession: boolean;
  authenticatedUser?: AuthenticatedUser | null;
  configSource: string;
}

export interface OAuthConfigInput {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
}

export interface AuthLaunch {
  authorizeUrl: string;
  redirectUri: string;
}
