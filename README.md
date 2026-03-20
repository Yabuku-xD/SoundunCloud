# SoundunCloud

```text
   _____                       __            ______ __                __
  / ___/____  __  ______  ____/ /___  ____  / ____// /___  __  ______/ /
  \__ \/ __ \/ / / / __ \/ __  / __ \/ __ \/ /    / / __ \/ / / / __  /
 ___/ / /_/ / /_/ / / / / /_/ / /_/ / / / / /___ / / /_/ / /_/ / /_/ /
/____/\____/\__,_/_/ /_/\__,_/\____/_/ /_/\____//_/\____/\__,_/\__,_/
```

An unofficial Windows desktop companion for SoundCloud listeners, built with Rust and Tauri.

![Version](https://img.shields.io/badge/version-v0.5.0-F28C52)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-1f6feb)
![Stack](https://img.shields.io/badge/stack-Rust%20%2B%20Tauri%20%2B%20React-111827)
![License](https://img.shields.io/badge/license-MIT-2f855a)

SoundunCloud is a desktop-first SoundCloud shell focused on fast startup, clean Windows chrome, in-app updates, and a local persistent SoundCloud web session without requiring you to host any backend. It is not affiliated with SoundCloud.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Optional Auth Service Notes](#optional-auth-service-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Background

The current unofficial SoundCloud desktop ecosystem tends to fall into two extremes: browser wrappers that feel heavy, or reverse-engineered clients that are difficult to maintain. SoundunCloud takes a different path:

- Keep the desktop shell native and light with Rust + Tauri.
- Let the user sign in on the real SoundCloud website inside the app, so likes, feed, playlists, and account state come from SoundCloud itself.
- Keep the browsing session on that device through the embedded WebView profile instead of forcing per-launch reauth.
- Give the app a cleaner, darker, more desktop-native shell than a normal browser tab.

This current release avoids the SoundCloud app-registration blocker entirely by using local web-shell mode. The optional auth-service in this repo is still available for future custom API-driven work, but it is not required for normal sign-in now.

- [SoundCloud website](https://soundcloud.com)
- [SoundCloud API guide: Authentication](https://developers.soundcloud.com/docs/api/guide#authentication)
- [SoundCloud API sign-up changes](https://developers.soundcloud.com/blog/api-sign-up-changes/)

## Features

- Frameless black-tinted Windows desktop shell with floating window controls and a dedicated drag region
- Embedded SoundCloud web shell that loads the real site inside the app with a persistent local browsing profile
- Real SoundCloud likes, feed, playlists, and account state through the official website session
- No hosting required for normal sign-in or playback
- Official white SoundCloud wordmark in the startup shell
- In-app updater support with a single themed bottom-right update control for checking, installing, or falling back to the setup download
- Optional experimental auth-service prototype kept in-repo for future custom native/API mode

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              SoundunCloud                                 │
├───────────────────────────────┬────────────────────────────────────────────┤
│ React / TypeScript shell      │ Rust / Tauri desktop core                  │
│                               │                                            │
│ • startup launcher overlay    │ • frameless window controls                │
│ • top chrome + updater        │ • child webview host                       │
│ • retry / browser fallback    │ • local window sizing + drag               │
│ • SoundCloud launch states    │ • NSIS packaging + updater                 │
├───────────────────────────────┬────────────────────────────────────────────┤
│ Embedded WebView profile      │ SoundCloud website                         │
│                               │                                            │
│ • local cookies/session       │ • real feed, likes, playlists              │
│ • cached browsing data        │ • real account sign-in                     │
│ • persists on the same device │ • official web playback + library views    │
└────────────────────────────────────────────────────────────────────────────┘
```

The default app mode is now local-only. SoundCloud session data lives in the embedded webview profile on that machine, so the normal user experience is "sign in once on this device, then stay signed in." The optional Rust auth service remains in this repo for future custom UI experiments, but it is no longer required just to use the app.

## Install

### Dependencies

- Node.js 22+
- Rust stable
- Windows 10 or Windows 11 for packaged `.exe` use

### Local development

```bash
npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

For the optional auth service prototype:

```bash
cargo run --manifest-path auth-service/Cargo.toml
```

Use the NSIS setup installer under `src-tauri/target/release/bundle/nsis/`.
That setup `.exe` is the intended installable artifact. Install it once, then let the app's built-in updater handle future releases when an update is available.

## Usage

1. Launch the desktop app.
2. Let SoundunCloud open the embedded SoundCloud shell.
3. Sign in on the real SoundCloud website inside the app if you are not already signed in.
4. Keep using your feed, likes, playlists, and library directly from the SoundCloud site inside the desktop shell.
5. When a new release is available, install it from the in-app update prompt.

## Configuration

Normal desktop usage does not require any configuration or hosting.

If you want to experiment with the optional auth-service path later, the desktop app can still be pointed at a public auth service URL:

```bash
SOUNDUNCLOUD_AUTH_BASE_URL=https://your-auth-service.example.com
```

The Rust auth service keeps the SoundCloud app credentials and handles token exchange and refresh:

```bash
SOUNDCLOUD_CLIENT_ID=your_client_id
SOUNDCLOUD_CLIENT_SECRET=your_client_secret
SOUNDUNCLOUD_AUTH_SECRET=replace_with_a_long_random_secret
SOUNDUNCLOUD_PUBLIC_BASE_URL=https://your-auth-service.example.com
SOUNDUNCLOUD_BIND_ADDR=127.0.0.1:8787
```

An example file is included in [`.env.example`](./.env.example). For a public release, deploy the auth service, then point desktop builds at that public auth URL.
You can provide `SOUNDUNCLOUD_AUTH_BASE_URL` as a runtime environment variable during development or bake it into packaged desktop builds through the build environment.

### Optional deployment path

The current auth service is small enough to deploy without a database, but it is not needed for the default web-shell experience.

- Cheapest fully free test path: Render free web service
- Cheapest long-term low-friction paid path: Fly.io small VM
- Current repo includes [`auth-service/Dockerfile`](./auth-service/Dockerfile) so you can deploy the auth service as a container without rewriting it

For a public deployment you need:

1. A SoundCloud app with a registered redirect URI
2. A public auth service URL such as `https://sounduncloud-auth.example.com`
3. These auth-service environment variables on the host:
   - `SOUNDCLOUD_CLIENT_ID`
   - `SOUNDCLOUD_CLIENT_SECRET`
   - `SOUNDUNCLOUD_AUTH_SECRET`
   - `SOUNDUNCLOUD_PUBLIC_BASE_URL`

Once that host exists, rebuild the desktop app with:

```bash
SOUNDUNCLOUD_AUTH_BASE_URL=https://your-auth-service.example.com npm run tauri build
```

## Optional Auth Service Notes

- SoundCloud's current docs say OAuth uses OAuth 2.1 with PKCE.
- SoundCloud also notes that apps need registered credentials and that new API access still goes through an application or review process.
- Because app creation can be blocked for some accounts, the current shipped app uses embedded website sign-in by default instead of depending on that auth flow.
- The auth service in this repo is therefore optional future infrastructure, not a requirement for the current release.

For the official references, see:

- [Authentication guide](https://developers.soundcloud.com/docs/api/guide#authentication)
- [API introduction](https://developers.soundcloud.com/docs/api/introduction)
- [API sign-up policy](https://developers.soundcloud.com/blog/api-sign-up-changes/)

## Roadmap

- Native media key handling and richer Windows session controls
- Search, queue, and section expansion beyond the current minimal home
- Profile, repost, and following surfaces beyond the initial personalized feed
- Better account tools and richer playback controls
- Optional tray mode and background playback controls

## Contributing

Issues and pull requests are welcome. If you contribute:

- keep changes scoped and documented
- run `npm run build`
- run `cargo check` in `src-tauri`

## License

MIT. See [`LICENSE`](./LICENSE).
