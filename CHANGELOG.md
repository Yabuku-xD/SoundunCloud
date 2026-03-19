# Changelog

## v0.3.2 - 2026-03-19

- Removed the native Windows title bar again and replaced it with lightweight floating window controls so the centered startup stage stays visually clean
- Stopped the signed-out startup from shifting by keeping status space stable and moving feedback overlays out of normal page flow
- Made the updater check fail fast in the background instead of leaving a visible `Checking for updates...` line hanging on screen

## v0.3.1 - 2026-03-19

- Fixed short-height window behavior so the left rail no longer forces a full-viewport column on small vertical space
- Let the player dock fall back into normal page flow on shorter windows, which keeps content reachable without waiting for a narrow-width breakpoint

## v0.3.0 - 2026-03-19

- Added Tauri updater support so the installed desktop app can detect and install new releases in-app
- Simplified the signed-out startup screen into a single SoundCloud-style sign-in surface with SoundCloud orange accents
- Removed the extra in-app native-controls banner and the exposed developer-key setup form from the startup experience
- Added release tooling for GitHub-hosted `latest.json` updater metadata

## v0.2.1 - 2026-03-19

- Restored native Windows window decorations so drag, minimize, maximize, and close behave like a normal desktop app
- Simplified distribution to the NSIS setup `.exe`, which upgrades the same installed SoundunCloud app instead of encouraging raw binary launches
- Kept the personalized sign-in-gated home flow from `v0.2.0`

## v0.2.0 - 2026-03-19

- Rebuilt the desktop flow around a required browser-based SoundCloud sign-in gate
- Added a personalized signed-in home powered by SoundCloud feed, likes, playlists, and local recent plays
- Simplified the app shell into a more minimal layout with a persistent bottom player dock
- Kept review fixes in place, including secure token storage, auth timeout handling, keyboard focus, live feedback, and better small-window behavior

## v0.1.1 - 2026-03-19

- Reworked the desktop UI with a calmer editorial layout and stronger hierarchy
- Fixed keyboard focus, empty states, live status messaging, and reduced-motion handling
- Moved OAuth secrets and session tokens into secure local storage with session refresh handling
- Added a dedicated drag handle so the undecorated desktop window can be moved reliably

## v0.1.0 - 2026-03-19

- Initial `SoundunCloud` release scaffold
- Added Tauri + React desktop shell for Windows
- Added browser-based SoundCloud OAuth flow scaffolding with PKCE
- Added local config persistence for SoundCloud app credentials
- Added local favorites, search history, imported URL library, and recent plays
- Added README with ASCII hero and architecture diagram
