# MomentAI Mobile

Capacitor + Vite (vanilla JS) client for [MomentAI](https://momentai.dev).

This repository is the **App Store / Play** shell only. The Express/Prisma API and browser UI live in **[tahaarif3/MomentAi](https://github.com/tahaarif3/MomentAi)**. Mobile consumes the hosted HTTPS API — it does not copy or submodule `src/public`.

## Phase 0 API (MomentAi web)

Confirmed on branch `cursor/phase-0-mobile-api-f096` and partially live on production:

| Capability | Status |
| --- | --- |
| `GET /api/mobile/compatibility` | Live on `https://momentai.dev` |
| `progressToken` on process / SSE / poll | On Phase 0 branch — ensure merged/deployed |
| HEIC accept + sharp→JPEG | Phase 0 branch |
| `DELETE /api/auth/account` | Phase 0 branch |
| `POST /api/billing/revenuecat` stub | Phase 0 branch |

Contract docs (web repo): `docs/mobile-api.md`, `docs/spaces-setup.md`, `docs/mobile-migration-brief.md`.

## Stack

| Piece | Detail |
| --- | --- |
| Build | Vite → `dist/mobile` |
| Native | Capacitor 7 (`ios/` + `android/`) |
| App id | `dev.momentai.app` |
| Auth | Supabase PKCE + Capacitor Preferences |
| Jobs | SSE + `progressToken`, poll fallback, resume |
| Billing | StoreKit/Play (RevenueCat) later — **no Stripe in native** |

```
src/  →  vite build  →  dist/mobile  →  npx cap sync  →  ios/ / android/
```

## Setup

```bash
cp .env.example .env
# VITE_API_BASE=https://momentai.dev
# Supabase keys optional if GET /api/auth/config works
# VITE_AUTH_REDIRECT_URL=momentai://auth/callback

npm install
npm run dev          # http://localhost:5173
npm run build
npx cap sync
npx cap open android # or ios (macOS + CocoaPods)
```

### Environment

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Absolute API origin (default `https://momentai.dev`) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Optional override; else `/api/auth/config` |
| `VITE_AUTH_REDIRECT_URL` | Default `momentai://auth/callback` |
| `VITE_APP_VERSION` | Compared to compatibility endpoint |
| `VITE_GA4_MEASUREMENT_ID` | Optional analytics |
| `VITE_REVENUECAT_*` | Phase 6 store billing |

Never commit `.env`.

### Deep links (Phase 2)

Allowlist in **Supabase → Authentication → URL configuration**:

- `momentai://auth/callback`
- `https://momentai.dev/auth/callback`

Native wiring:

- Android: `momentai://auth/callback` + App Link `https://momentai.dev/auth/callback` in `AndroidManifest.xml`
- iOS: URL scheme `momentai` in `Info.plist`; add Associated Domains entitlement on a Mac before shipping Universal Links
- Web repo should host `.well-known/apple-app-site-association` and `assetlinks.json` (placeholders on Phase 0 branch)

Flows: sign-in / sign-up / password reset / logout / session refresh via Preferences storage. After auth, client calls `POST /api/auth/callback` to upsert the Postgres user.

### Camera + jobs (Phase 3)

1. Camera and photo-library permissions requested separately (denied UX + Settings hint).
2. URI-based capture → JPEG compress ~2–4 MB (canvas; strips EXIF). HEIC falls back to server convert when needed.
3. `POST /api/playlist/process` → persist `{ jobId, progressToken }` in Preferences.
4. **Primary:** `EventSource(VITE_API_BASE/api/playlist/job/:id/stream?progressToken=…)`
5. **Fallback / resume:** poll `GET .../job/:id?progressToken=…` on SSE error or app foreground.

### Product surfaces (Phase 4)

- History open from home grid
- Suggest more / regenerate (Plus)
- Save playlist (master Spotify account) → open URL with `@capacitor/browser`
- Share card: Filesystem temp PNG → Share sheet → delete temp (needs Spaces CORS for remote photos)

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | → `dist/mobile` |
| `npm run cap:sync` | Build + `cap sync` |
| `npm run test:unit` | Lightweight Node tests |

## Manual / Maestro checks

Auth (device or emulator):

1. Sign up → confirm email if required → sign in
2. Password reset email → open `momentai://` / Universal Link → session set
3. Kill app → relaunch → session still present
4. Sign out

Camera + generate:

1. Camera + library capture → generate → loading SSE → playlist
2. Background during generation → reopen → resume/poll completes
3. Deny camera permission → Settings message shown

See `maestro/smoke.yaml` for a minimal UI smoke.

## What is gitignored

`node_modules/`, `dist/`, `.env*`, IDE/OS junk, Android/iOS build caches, Capacitor-synced `public/` folders. See root `.gitignore` plus `android/.gitignore` / `ios/.gitignore`.

## Explicit non-goals

- No monorepo / submodule of the web UI
- No Capacitor `server.url` pointing at the live website
- No Stripe Checkout in public native builds
- No per-user Spotify OAuth (master-account export only)
- No Spotify secrets / Prisma / BullMQ in this repo
