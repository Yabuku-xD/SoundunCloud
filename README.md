# SoundunCloud

```text
   _____                       __            ______ __                __
  / ___/____  __  ______  ____/ /___  ____  / ____// /___  __  ______/ /
  \__ \/ __ \/ / / / __ \/ __  / __ \/ __ \/ /    / / __ \/ / / / __  /
 ___/ / /_/ / /_/ / / / / /_/ / /_/ / / / / /___ / / /_/ / /_/ / /_/ /
/____/\____/\__,_/_/ /_/\__,_/\____/_/ /_/\____//_/\____/\__,_/\__,_/
```

An unofficial Windows desktop companion for SoundCloud listeners, built with Rust and Tauri.

![Version](https://img.shields.io/badge/version-v0.3.4-F28C52)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-1f6feb)
![Stack](https://img.shields.io/badge/stack-Rust%20%2B%20Tauri%20%2B%20React-111827)
![License](https://img.shields.io/badge/license-MIT-2f855a)

SoundunCloud is a desktop-first SoundCloud client shell focused on fast startup, a minimal signed-in home, in-app updating, and a browser-driven sign-in flow that matches SoundCloud's current OAuth requirements. It is not affiliated with SoundCloud.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [OAuth Notes](#oauth-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Background

The current unofficial SoundCloud desktop ecosystem tends to fall into two extremes: browser wrappers that feel heavy, or reverse-engineered clients that are difficult to maintain. SoundunCloud takes a different path:

- Keep the desktop shell native and light with Rust + Tauri.
- Use SoundCloud's embeddable playback surfaces for listening.
- Support authenticated desktop sign-in through the browser, using SoundCloud's documented OAuth flow.
- Give the app a cleaner, darker, more media-forward layout than generic starter templates.

SoundCloud's official developer docs currently describe authentication as OAuth 2.1 with PKCE, and they note that apps still need approved API credentials before sign-in can work:

- [SoundCloud API guide: Authentication](https://developers.soundcloud.com/docs/api/guide#authentication)
- [SoundCloud API introduction](https://developers.soundcloud.com/docs/api/introduction)
- [SoundCloud API sign-up changes](https://developers.soundcloud.com/blog/api-sign-up-changes/)

## Features

- Glassmorphic frameless Windows desktop shell with floating window controls and Tauri packaging
- Minimal SoundCloud-style startup gate with a single browser-based sign-in action
- Official white-on-transparent SoundCloud wordmark on the startup surface
- Required browser-based SoundCloud OAuth bootstrap before the app home unlocks
- Personalized signed-in home built from your SoundCloud feed, liked tracks, playlists, and recent desktop plays
- Secure local storage for tokens and app secrets via OS-backed keyring storage
- Embedded SoundCloud widget playback inside the app with a persistent desktop player dock
- In-app updater support for installing new releases without rerunning loose binaries
- Search handoff to SoundCloud's web search when you need results beyond the current home view

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              SoundunCloud                                 │
├───────────────────────────────┬────────────────────────────────────────────┤
│ React / TypeScript UI         │ Rust / Tauri backend                       │
│                               │                                            │
│ • signed-out auth gate        │ • app metadata                             │
│ • personalized home           │ • OAuth config persistence                 │
│ • home search + player dock   │ • secure keyring token storage             │
│ • SoundCloud widget iframe    │ • PKCE generation                          │
│ • browser handoff             │ • token exchange + /me/feed lookup         │
│ • in-app updater notice       │ • signed updater metadata + install flow   │
├───────────────────────────────┴────────────────────────────────────────────┤
│ Browser OAuth                                                          │
│ • opens SoundCloud authorize URL                                        │
│ • user signs in on soundcloud.com                                       │
│ • browser redirects to local callback                                   │
│ • desktop app stores local session                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

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

Use the NSIS setup installer under `src-tauri/target/release/bundle/nsis/`.
That setup `.exe` is the intended installable artifact. Install it once, then let the app's built-in updater handle future releases when an update is available.

## Usage

1. Launch the desktop app.
2. Click `Sign in with SoundCloud` to complete browser-based OAuth.
3. Return to the desktop app to see your personalized home feed.
4. When a new release is available, install it from the in-app update prompt.

## Configuration

SoundunCloud no longer exposes a developer-key form in the startup UI. For development or self-hosted builds, provide OAuth credentials through environment variables:

```bash
SOUNDUNCLOUD_CLIENT_ID=your_client_id
SOUNDUNCLOUD_CLIENT_SECRET=your_client_secret
SOUNDUNCLOUD_REDIRECT_PORT=8976
```

An example file is included in [`.env.example`](./.env.example). Once credentials are available to the app, end users only see the minimal sign-in gate.

## OAuth Notes

- SoundCloud's current docs say OAuth uses OAuth 2.1 with PKCE.
- The authorization URL is opened in the user's browser, not embedded in-app.
- SoundCloud also notes that apps need registered credentials and that new API access still goes through an application/review process.
- The docs currently say all clients are treated as confidential, which means a client secret is still required even for desktop-style flows.

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
