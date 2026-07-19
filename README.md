# MomentAI Mobile

Capacitor + Vite (vanilla JS) client for [MomentAI](https://momentai.dev).

Independent from the **[MomentAi](https://github.com/tahaarif3/MomentAi)** web/API repo. Shares the HTTPS API contract only.

## You can test now

**Browser (fastest):**

```bash
npm install
cp .env.example .env   # optional — auth config also loads from the API
npm run dev            # http://localhost:5173
```

Full instructions: **[docs/testing.md](./docs/testing.md)**.

Native Android/iOS need Android Studio or a Mac. Store IAP needs RevenueCat keys.

## Phases

| Phase | Status |
| --- | --- |
| 0 API security / progressToken / compatibility | MomentAi web (`cursor/phase-0-mobile-api-f096`; compatibility live on prod) |
| 1 Vite + Capacitor scaffold | Done |
| 2 Supabase PKCE auth + deep links | Done |
| 3 Camera + SSE/poll resume | Done |
| 4 History / Spotify / share | Done |
| 5 Deletion re-auth, GA4, Sentry, disclosures | Done |
| 6 RevenueCat native billing (Stripe hidden) | Done (needs your store API keys) |
| 7 Maestro + QA / store docs | Done |

## Setup

```bash
npm install
npm run build
npx cap sync
npx cap open android   # or ios on macOS
```

### Environment

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Default `https://momentai.dev` |
| `VITE_SUPABASE_*` | Optional; else `/api/auth/config` |
| `VITE_AUTH_REDIRECT_URL` | Default `momentai://auth/callback` |
| `VITE_GA4_MEASUREMENT_ID` | Optional analytics |
| `VITE_SENTRY_DSN` | Optional crash reporting |
| `VITE_REVENUECAT_IOS_API_KEY` / `ANDROID` | Store billing |
| `VITE_REVENUECAT_ENTITLEMENT_ID` | Default `premium` |

### Deep links

Allowlist in Supabase Auth URLs:

- `momentai://auth/callback`
- `https://momentai.dev/auth/callback`

## Docs

- [docs/testing.md](./docs/testing.md) — when/how to test
- [docs/qa-matrix.md](./docs/qa-matrix.md) — device QA checklist
- [docs/store-submission.md](./docs/store-submission.md) — store notes
- API contract: MomentAi `docs/mobile-api.md`

## Explicit non-goals

- No web UI submodule / Capacitor wrapping the live site
- No Stripe Checkout in native builds
- No per-user Spotify OAuth (master-account export only)
