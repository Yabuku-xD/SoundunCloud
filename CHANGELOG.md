# Changelog

## v0.5.0 - 2026-03-19

- Pivoted the desktop app into a local SoundCloud web-shell mode so users can sign in and use the real SoundCloud site inside the app without hosting any backend
- Replaced the blocked custom auth gate on the startup surface with direct embedded SoundCloud launching and local on-device web session persistence
- Reworked the shell around a dedicated top drag chrome, working floating window controls, and a reserved bottom update strip that no longer depends on the old signed-in home layout
- Removed the whole-window Mica dependency from the main shell path so the app stops depending on the unstable transparent-window auth stage just to get users signed in

## v0.4.1 - 2026-03-19

- Reworked the auth service into a stateless local-first broker by sealing short-lived sign-in state and desktop tickets instead of keeping pending auth in server memory
- Added deployment-ready auth-service container packaging so the browser OAuth broker can run on low-cost or free hosts without a database
- Clarified the signed-out startup copy around the intended user flow: sign in once in the browser, then keep the session securely on that device
- Added `SOUNDUNCLOUD_AUTH_SECRET` support and a `PORT` fallback so public auth deployments are easier to wire up

## v0.4.0 - 2026-03-19

- Replaced the desktop's local client-secret OAuth flow with a backend-assisted browser OAuth architecture built for public multi-user installs
- Added a Rust auth service that starts SoundCloud OAuth, handles the callback, exchanges the auth code, issues one-time desktop tickets, and refreshes stored sessions
- Swapped the desktop app to deep-link completion through `sounduncloud://auth/callback`, keeping user tokens local while removing the need to ship the SoundCloud client secret inside the app
- Updated the README and environment model to separate desktop config from auth-service secrets

## v0.3.12 - 2026-03-19

- Clarified the signed-out gate when SoundCloud browser sign-in is unavailable because this install has no OAuth credentials configured at runtime
- Replaced the misleading loading cursor on the disabled sign-in button with a proper unavailable state so the app no longer looks hung

## v0.3.11 - 2026-03-19

- Kept updater states inside the same bottom-right control, so `Check for updates`, `Update available`, and fallback download actions now live in one seamless place
- Removed the noisy updater toast and install-progress churn that made the signed-out startup gate flicker during failed update attempts
- Added a manual setup-download fallback in the same updater control when automatic install cannot complete

## v0.3.10 - 2026-03-19

- Removed the visible drag strip and kept frameless movement working through an invisible drag surface instead of the old top bar
- Reworked the startup shell to use a darker, steadier black-tinted glass treatment that avoids the opaque-to-glass flicker while moving the window
- Moved update handling into a compact themed bottom-right action so the startup screen and signed-in header stay cleaner

## v0.3.9 - 2026-03-19

- Restored working custom window controls on the frameless shell by routing drag, minimize, maximize, and close through native Tauri window commands for the real `main` window
- Kept the startup shell in the darker glassmorphic direction instead of slipping back to the flatter older stage
- Preserved the centered hidden-show startup behavior and existing SoundCloud app and installer icon packaging

## v0.3.8 - 2026-03-19

- Rebalanced the startup shell glass so it keeps the lighter translucent feel instead of slipping back into the flatter darker look
- Wired the official SoundCloud-based Windows icon into the NSIS installer executable so the setup file and packaged app branding finally match
- Kept the hidden-center-show launch behavior unchanged so the startup screen still opens centered

## v0.3.7 - 2026-03-19

- Darkened the glass tint so bright windows behind the app stop bleaching the startup shell into a washed-out grey
- Rebuilt the Windows icon set around an official SoundCloud cloudmark-based app icon for the taskbar, installer, and packaged app
- Kept the centered startup behavior from `v0.3.6` unchanged

## v0.3.6 - 2026-03-19

- Removed the inner full-window outline from the startup shell so the glass surface feels cleaner
- Dropped the centered sign-in card box styling while keeping the startup content in the same centered position
- Preserved the hidden-center-show startup behavior and drag-anywhere signed-out shell from `v0.3.5`

## v0.3.5 - 2026-03-19

- Open the frameless window hidden, center it, then show it so startup lands in the middle of the active screen instead of creeping toward the top
- Restored drag-anywhere behavior for the signed-out shell by treating non-interactive startup space as a drag surface
- Reduced the chalky white overlay so the glass reads clearer and darker while still blurring the desktop behind it

## v0.3.4 - 2026-03-19

- Switched the UI to a system monospace stack for a more technical, restrained shell
- Reworked the glass treatment so the centered startup card reads as frosted glass instead of a flat dark block
- Tuned the window translucency to be lighter and cleaner without relying on staging another app behind it

## v0.3.3 - 2026-03-19

- Added a glassmorphic frameless window shell with real Windows blur so the desktop app subtly reveals what is behind it instead of reading as a flat black slab
- Replaced the temporary startup mark with SoundCloud's official white transparent horizontal logo from the SoundCloud media kit
- Kept the minimal signed-out stage intact while making the floating window controls and gate surface match the new translucent look

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
