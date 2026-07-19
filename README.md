# MomentAI Mobile

Independent **Capacitor + Vite (vanilla JS)** client for [MomentAI](https://momentai.dev).

This repo is **not** the web app. The Express/Prisma API and `src/public/` UI live in the separate **MomentAi** web repository. Mobile talks to the hosted API over HTTPS (`VITE_API_BASE`).

## Architecture

```
src/  →  Vite build  →  dist/mobile  →  npx cap sync  →  ios/ / android/
```

- **App id:** `dev.momentai.app`
- **webDir:** `dist/mobile` (`capacitor.config.json`)
- **Deep links:** Universal/App Links on `momentai.dev` + `momentai://` fallback (Phase 2)
- **Plugins:** imported as ES modules (`@capacitor/camera`, `@capacitor/filesystem`, …)

## Phase map

| Phase | Status in this repo |
| --- | --- |
| 0 Backend security / Spaces / progressToken / compatibility | Web repo only |
| **1 Vite + Capacitor scaffold** | **This PR** |
| 2 Supabase PKCE + secure storage + Universal Links | Stubs in `src/lib/auth.js` |
| 3 Camera URI→Blob, compress, HEIC, SSE+resume | Stubs + basic flow in `main.js` |
| 4 History, Spotify handoff, native share | Partial scaffold |
| 5 Deletion UI, analytics, Sentry | Stubs |
| 6 RevenueCat / StoreKit / Play Billing | Stubs (no Stripe UI) |
| 7 Maestro / device QA / store submission | `maestro/` placeholder |

## Setup

```bash
cp .env.example .env
# set VITE_API_BASE, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

npm install
npm run dev          # browser preview
npm run build        # writes dist/mobile
npx cap sync
npx cap open android # or ios (macOS)
```

### Native projects

- `android/` and `ios/` native shells are checked in.
- iOS `pod install` / Xcode builds require macOS (CocoaPods not available in Linux CI).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production WebView assets → `dist/mobile` |
| `npm run cap:sync` | Build + `cap sync` |
| `npm run cap:android` / `cap:ios` | Sync and open IDE |

## Explicit non-goals

- No git submodule / copy of MomentAi `src/public`
- No Capacitor `server.url` pointing at the live website
- No Stripe Checkout buttons in public native builds
- No Spotify secrets, Prisma, or BullMQ in this repo
