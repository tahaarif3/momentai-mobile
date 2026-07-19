# Native QA matrix

Playwright covers the MomentAi **web** repo. Use this checklist (+ Maestro) before store builds.

| Case | iOS | Android | Notes |
|------|-----|---------|-------|
| Cold start + compatibility check | ☐ | ☐ | Force-upgrade toast if API flags it |
| Email sign-up / sign-in | ☐ | ☐ | Preferences session persistence |
| Password reset deep link | ☐ | ☐ | PKCE `exchangeCodeForSession` |
| Expired session refresh | ☐ | ☐ | Kill app, reopen |
| Reinstall / logout | ☐ | ☐ | No stale JWT |
| Camera permission deny / Settings | ☐ | ☐ | Separate from photos |
| Photo library deny | ☐ | ☐ | |
| HEIC capture → generate | ☐ | ☐ | Server also accepts HEIC |
| Oversized image compress to ~2–4MB | ☐ | ☐ | |
| Background during generation | ☐ | ☐ | Resume via poll + persisted job |
| Network loss on upload | ☐ | ☐ | Error + retry |
| Share sheet (Filesystem PNG) | ☐ | ☐ | Spaces CORS for remote photo |
| Spotify installed / not installed | ☐ | ☐ | Browser open playlist URL |
| Purchase sandbox | ☐ | ☐ | RevenueCat keys required |
| Restore purchases | ☐ | ☐ | |
| Account deletion (+ password re-auth) | ☐ | ☐ | Also web `/delete-account.html` |

## Tooling

- Prefer **Maestro** flows in `maestro/` for Capacitor/vanilla.
- **iOS device builds require macOS/Xcode** (or a cloud Mac).
- Android can build from Linux/Windows with Android Studio / SDK.
