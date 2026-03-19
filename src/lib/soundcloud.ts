import type { LibraryTone, SoundCloudKind, SoundCloudOEmbed } from "../types";

const SOUND_CLOUD_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com"]);
const OEMBED_ENDPOINT = "https://soundcloud.com/oembed";
const widgetScriptUrl = "https://w.soundcloud.com/player/api.js";
const tones: LibraryTone[] = ["ember", "ocean", "jade", "rose", "gold", "sky"];

let widgetApiPromise: Promise<void> | null = null;

export function normalizeSoundCloudUrl(input: string) {
  const url = new URL(input.trim());

  if (!SOUND_CLOUD_HOSTS.has(url.hostname)) {
    throw new Error("Paste a public SoundCloud URL from soundcloud.com.");
  }

  url.hash = "";
  url.search = "";

  return url.toString().replace(/\/$/, "");
}

export async function fetchSoundCloudOEmbed(
  url: string,
): Promise<SoundCloudOEmbed> {
  const response = await fetch(
    `${OEMBED_ENDPOINT}?format=json&maxheight=420&url=${encodeURIComponent(url)}`,
  );

  if (!response.ok) {
    throw new Error("SoundCloud did not return metadata for that page.");
  }

  const payload = (await response.json()) as {
    title: string;
    author_name: string;
    thumbnail_url?: string;
  };

  return {
    title: payload.title,
    authorName: payload.author_name,
    thumbnailUrl: payload.thumbnail_url,
    kind: inferKindFromUrl(url),
    tone: pickToneFromUrl(url),
  };
}

export function buildWidgetSrc(url: string) {
  return `https://w.soundcloud.com/player/?${new URLSearchParams(
    buildWidgetLoadOptions(false) as Record<string, string>,
  ).toString()}&url=${encodeURIComponent(url)}`;
}

export function buildWidgetLoadOptions(autoPlay: boolean) {
  return {
    auto_play: autoPlay ? "true" : "false",
    visual: "true",
    show_comments: "false",
    show_reposts: "false",
    hide_related: "false",
    show_playcount: "false",
    buying: "false",
    sharing: "false",
    download: "false",
  };
}

export function describeKind(kind: SoundCloudKind) {
  switch (kind) {
    case "track":
      return "track";
    case "playlist":
      return "playlist";
    case "profile":
      return "profile";
    default:
      return "page";
  }
}

export async function loadSoundCloudWidgetApi() {
  const soundCloudWindow = window as Window & {
    SC?: { Widget?: unknown };
  };

  if (
    typeof window === "undefined" ||
    typeof soundCloudWindow.SC?.Widget === "function"
  ) {
    return;
  }

  if (!widgetApiPromise) {
    widgetApiPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${widgetScriptUrl}"]`,
      );

      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load SoundCloud widget API.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = widgetScriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load SoundCloud widget API."));
      document.head.append(script);
    });
  }

  await widgetApiPromise;
}

function inferKindFromUrl(url: string): SoundCloudKind {
  const { pathname } = new URL(url);
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length <= 1) {
    return "profile";
  }

  if (parts[1] === "sets") {
    return "playlist";
  }

  return "track";
}

function pickToneFromUrl(url: string): LibraryTone {
  const hash = [...url].reduce((total, char) => total + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
}
