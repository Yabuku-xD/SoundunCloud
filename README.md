# SoundunCloud

```text
   _____                       __            ______ __                __
  / ___/____  __  ______  ____/ /___  ____  / ____// /___  __  ______/ /
  \__ \/ __ \/ / / / __ \/ __  / __ \/ __ \/ /    / / __ \/ / / / __  /
 ___/ / /_/ / /_/ / / / / /_/ / /_/ / / / / /___ / / /_/ / /_/ / /_/ /
/____/\____/\__,_/_/ /_/\__,_/\____/_/ /_/\____//_/\____/\__,_/\__,_/
```

An unofficial Windows desktop client for SoundCloud listeners, built with Rust, Tauri, and React.

![Version](https://img.shields.io/badge/version-v0.8.0-F28C52)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-1f6feb)
![Stack](https://img.shields.io/badge/stack-Rust%20%2B%20Tauri%20%2B%20React-111827)
![License](https://img.shields.io/badge/license-MIT-2f855a)

SoundunCloud is a desktop-first SoundCloud client with a custom native shell, local audio engine, real account data, and desktop playback controls. It is not affiliated with SoundCloud.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Background

The current unofficial SoundCloud desktop ecosystem tends to fall into two extremes: browser wrappers that feel heavy, or custom clients that lose the feel of a desktop app. SoundunCloud now takes the second path seriously:

- Keep the desktop chrome native and light with Rust + Tauri.
- Render a real custom app shell for home, library, playlists, search, and now playing.
- Pull account data through the SoundCloud desktop API flow used by the transplanted upstream client architecture.
- Keep playback, caching, tray actions, and media controls inside the desktop app instead of inside a browser wrapper.

This release replaces the earlier embedded website shell with a real native client layout.

- [SoundCloud website](https://soundcloud.com)
- [SoundCloud API guide: Authentication](https://developers.soundcloud.com/docs/api/guide#authentication)
- [SoundCloud API sign-up changes](https://developers.soundcloud.com/blog/api-sign-up-changes/)

## Features

- Custom desktop shell with sidebar, titlebar, library, search, settings, and now playing views
- Real SoundCloud account data, likes, playlists, reposts, tracks, and search results
- Native audio playback pipeline with queueing, shuffle, repeat, EQ, caching, and save-to-disk support
- Media key integration, tray controls, and Discord rich presence
- Frameless Windows windowing with custom minimize, maximize, close, and drag regions
- Release-check modal and packaged NSIS installer artifacts for desktop distribution

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              SoundunCloud                                 │
├───────────────────────────────┬────────────────────────────────────────────┤
│ React / TypeScript shell      │ Rust / Tauri desktop core                  │
│                               │                                            │
│ • native pages + routing      │ • frameless window controls                │
│ • login, home, library        │ • audio playback engine                    │
│ • queue, lyrics, settings     │ • cache/proxy/static local services        │
│ • now-playing desktop shell   │ • tray, media keys, updater packaging      │
├───────────────────────────────┬────────────────────────────────────────────┤
│ Local desktop state           │ SoundCloud data services                   │
│                               │                                            │
│ • session + settings storage  │ • auth session + account data              │
│ • audio cache + artwork cache │ • tracks, likes, playlists, search         │
│ • queue and playback state    │ • stream URLs and metadata                 │
└────────────────────────────────────────────────────────────────────────────┘
```

The app now behaves like a real desktop client: sign in, browse in the custom shell, and play tracks through the native player stack.

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
2. Sign in with your SoundCloud account.
3. Browse home, library, playlists, search, and profile views in the custom shell.
4. Play tracks through the desktop player with queue, shuffle, repeat, and media key support.
5. When a new release is available, install it from the in-app update prompt.

## Configuration

Normal desktop usage does not require any self-hosted backend. If you need to point the client at a different API host, use:

```bash
VITE_API_BASE=https://api.soundcloud.su
```

The legacy `auth-service` folder is still in the repo history as earlier experimentation, but it is no longer the primary app path.

## Roadmap

- Runtime polish and stability work after the desktop-client transplant
- Better release packaging and in-app update UX for the new shell
- More library and account-management depth
- Better onboarding for first login and API failures

## Contributing

Issues and pull requests are welcome. If you contribute:

- keep changes scoped and documented
- run `npm run build`
- run `cargo check` in `src-tauri`

## License

MIT. See [`LICENSE`](./LICENSE).
