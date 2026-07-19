# When / how to test the mobile app

## You can test **now** (browser)

No native toolchain required. This exercises API, auth (password), upload compression, job SSE/poll, history, and share preview against production.

```bash
cd momentai-mobile
git checkout cursor/phase-2-3-auth-progress-7bab   # or main after merge
npm install
cp .env.example .env
# Optional — app also loads keys from GET /api/auth/config:
# VITE_API_BASE=https://momentai.dev
npm run dev
# open http://localhost:5173
```

**Browser checklist**

1. Sign up / sign in (email+password)
2. Browse file → Generate → loading → playlist
3. Suggest more / Save to Spotify (opens URL)
4. Share screen preview
5. Account → delete flow (careful — real delete)

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

## Before store / paid testing

| Item | Who |
|------|-----|
| Merge MomentAi Phase 0 if any job routes still missing | You / API deploy |
| Supabase redirect allowlist: `momentai://auth/callback`, `https://momentai.dev/auth/callback` | You |
| `VITE_REVENUECAT_IOS_API_KEY` / `ANDROID` + store products | You |
| `REVENUECAT_WEBHOOK_SECRET` on API | You |
| Spaces CORS for share-card remote images | You |
| Real Apple Team ID / Play SHA in `.well-known` | You |

## What “done” means for local QA

| Surface | Ready without extra keys? |
|---------|---------------------------|
| Auth email/password | Yes (uses live `/api/auth/config`) |
| Capture file → playlist vs prod API | Yes |
| Job SSE / poll / resume | Yes (needs Phase 0 job routes in prod) |
| History / Spotify open | Yes (signed in) |
| Native camera / share sheet | Device build |
| Store purchase / restore | Device + RevenueCat keys |
| Deep link password reset | Device + Supabase allowlist |
