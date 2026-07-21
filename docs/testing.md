# When / how to test the mobile app

Full App Store path (Developer account → TestFlight → Review): see **[app-store-launch-plan.md](./app-store-launch-plan.md)**.

## You can test **now** (browser)

No native toolchain required. This exercises API, auth (password), upload compression, job SSE/poll, history, and share preview against production.

```bash
cd momentai-mobile
git checkout main   # or cursor/app-store-readiness-7bab before merge
npm install
cp .env.example .env
# Optional — app also loads keys from GET /api/auth/config:
# VITE_API_BASE=https://momentai.dev
npm run dev
# open http://localhost:5173
```

**Browser checklist**

1. Sign up / sign in (email+password) from **You** tab
2. Capture this moment → roll / shutter path (file picker on web)
3. Suggest more / Save to Spotify (opens URL)
4. Share screen preview
5. You → delete flow (careful — real delete)

Deep-link password reset and native camera/share/IAP need a device build.

## Android (next — on your machine)

Requires Android Studio + SDK. This cloud environment has no Android SDK.

```bash
npm run cap:sync
npx cap open android
# Run on emulator or USB device
```

Optional Maestro (with emulator running):

```bash
maestro test maestro/smoke.yaml
maestro test maestro/auth-screen.yaml
```

## iOS (needs a Mac)

```bash
npm run cap:sync
cd ios/App && pod install && cd ../..
npx cap open ios
```

Set your Apple Team under Signing & Capabilities. Associated Domains (`applinks:momentai.dev`) is already in `App.entitlements`.

## Before store / paid testing

| Item | Who |
|------|-----|
| Merge MomentAi legal + Phase 0; deploy privacy/terms | You |
| Supabase redirect allowlist: `momentai://auth/callback`, `https://momentai.dev/auth/callback` | You |
| `VITE_REVENUECAT_IOS_API_KEY` / `ANDROID` + store products | You |
| `REVENUECAT_WEBHOOK_SECRET` + `MOBILE_STORE_BILLING_ENABLED=true` on API | You |
| Spaces CORS for share-card remote images | You |
| Real Apple Team ID / Play SHA in `.well-known` | You (agent can edit files after you paste IDs) |

## What “done” means for local QA

| Surface | Ready without extra keys? |
|---------|---------------------------|
| Auth email/password | Yes (uses live `/api/auth/config`) |
| Capture file → playlist vs prod API | Yes |
| Job SSE / poll / resume | Yes |
| History / Spotify open | Yes (signed in) |
| Native camera / share sheet | Device build |
| Store purchase / restore | Device + RevenueCat keys |
| Deep link password reset | Device + Supabase allowlist + AASA Team ID |
