# App Store launch plan — MomentAI iOS

End-to-end path from **Apple Developer account** → **TestFlight** → **App Review**.  
Each step is labeled **YOU (manual)** or **AGENT (AI can do)** so you know who owns what.

Related PRs / branches:

| Repo | Branch / PR | What it covers |
|------|-------------|----------------|
| `momentai-mobile` | `cursor/bereal-design-handoff-7bab` (#3) | BeReal UI |
| `momentai-mobile` | `cursor/app-store-readiness-7bab` | Paywall legal, PrivacyInfo, entitlements, version align |
| `MomentAi` (web) | `cursor/app-store-legal-deeplinks-7bab` | Privacy/Terms IAP language |

---

## Who does what (quick map)

| Area | Agent can do | You must do |
|------|--------------|-------------|
| App UI / paywall legal copy | ✅ | Review |
| PrivacyInfo, entitlements, Info.plist | ✅ | Confirm Team in Xcode |
| Privacy / Terms HTML (IAP language) | ✅ (needs deploy) | Merge + deploy to momentai.dev |
| Apple Developer enrollment | ❌ | ✅ Pay $99, identity verify |
| App Store Connect app + IAP products | ❌ | ✅ Create in browser |
| RevenueCat dashboard + keys | ❌ | ✅ Account + paste keys |
| Xcode signing / Archive / TestFlight upload | ❌ | ✅ Needs Mac + Apple ID |
| AASA Team ID + assetlinks SHA | ❌ | ✅ Paste real IDs into files / ask agent after you have them |
| Supabase redirect allowlist | ❌ | ✅ Dashboard click |
| DigitalOcean env (`REVENUECAT_WEBHOOK_SECRET`, `MOBILE_STORE_BILLING_ENABLED`) | ❌ | ✅ Set on server |
| Screenshots, description, age rating | ❌ | ✅ Capture + fill ASC |
| Sandbox IAP testing on phone | ❌ | ✅ Physical device |
| Submit for App Review | ❌ | ✅ Final button |

---

## Phase 0 — Merge & deploy what agents already shipped

### 0.1 Merge mobile PRs — **YOU**
1. Merge [PR #3](https://github.com/tahaarif3/momentai-mobile/pull/3) (BeReal UI) if not already merged.
2. Merge `cursor/app-store-readiness-7bab` (or the PR opened from it).
3. On your machine after merge:
   ```bash
   git clone https://github.com/tahaarif3/momentai-mobile.git
   cd momentai-mobile
   git checkout main
   npm install
   ```

### 0.2 Merge & deploy web legal updates — **YOU** (+ agent already wrote the copy)
1. Merge MomentAi branch `cursor/app-store-legal-deeplinks-7bab`.
2. Deploy to DigitalOcean so `https://momentai.dev/privacy.html` and `/terms.html` show the IAP language.
3. Verify in a browser that Privacy mentions App Store / RevenueCat (not Stripe-only).

### 0.3 Optional agent follow-ups — **AGENT** (after you paste secrets)
Once you have Apple Team ID and Play SHA, ask an agent to replace placeholders in:
- `src/public/.well-known/apple-app-site-association` → `"TEAMID.dev.momentai.app"`
- `src/public/.well-known/assetlinks.json` → SHA256 fingerprint  
Then you redeploy.

---

## Phase 1 — Create Apple Developer account — **YOU only**

Agents cannot enroll or pay for you.

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
2. Sign in with the Apple ID you want as the app owner (personal or organization).
3. Choose **Individual** (fastest) or **Organization** (needs D-U-N-S; better if you have an LLC).
4. Pay the annual fee (~$99 USD).
5. Complete identity verification (can take from minutes to 48 hours).
6. When approved, open [developer.apple.com/account](https://developer.apple.com/account) and note your **Team ID** (Membership details → Team ID).  
   Example format: `A1B2C3D4E5`.

**Give the Team ID to an agent** so AASA can be updated:  
`appID` must become `"YOURTEAMID.dev.momentai.app"`.

---

## Phase 2 — App Store Connect app record — **YOU**

1. Open [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
2. Fill in:
   - **Platforms:** iOS
   - **Name:** MomentAI (must be unique in the store)
   - **Primary Language:** English
   - **Bundle ID:** register `dev.momentai.app` in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) if it does not exist, then select it
   - **SKU:** `momentai-ios-001` (internal; not shown to users)
   - **User Access:** Full Access
3. Save. Leave pricing / metadata for later phases.

**Bundle ID tip:** The app already uses `dev.momentai.app`. Changing later is painful — keep it unless you strongly prefer `app.momentai.mobile`.

---

## Phase 3 — Subscription product (IAP) — **YOU**

Apple Guideline 3.1 requires StoreKit for digital unlocks in the app.

1. In App Store Connect → your app → **Subscriptions**.
2. Create a **Subscription Group** (e.g. `MomentAI Plus`).
3. Add an **Auto-Renewable Subscription**:
   - Reference name: `MomentAI Plus Monthly`
   - Product ID: e.g. `momentai_plus_monthly` (you will paste this into RevenueCat)
   - Duration: **1 Month**
   - Price: **$3.99** or **$4.99** (pick one; UI falls back to $4.00 until RevenueCat loads live price)
   - Introductory offer: **Free trial — 7 days** (Free)
4. Add localized display name + description (“Unlimited moments, longer playlists, regenerate”).
5. Submit the subscription for review **with** the first app version (subscriptions cannot go live alone).

---

## Phase 4 — RevenueCat — **YOU** (agent already wired the SDK)

1. Create account at [revenuecat.com](https://www.revenuecat.com/).
2. Create a project → add **iOS** app with bundle ID `dev.momentai.app`.
3. Connect App Store Connect via **In-App Purchase Key** (App Store Connect → Users and Access → Integrations → In-App Purchase → generate key → upload to RevenueCat).
4. Create an **Entitlement** named `premium` (matches `VITE_REVENUECAT_ENTITLEMENT_ID`).
5. Create a **Product** matching your ASC product ID → attach to entitlement.
6. Create an **Offering** (Current) with a monthly package.
7. Copy the **iOS Public API Key** (`appl_...`).
8. Configure webhook:
   - URL: `https://momentai.dev/api/billing/revenuecat`
   - Authorization header / secret = value you will set as `REVENUECAT_WEBHOOK_SECRET` on DigitalOcean

### DigitalOcean env — **YOU**
On the MomentAi API host set:
```text
REVENUECAT_WEBHOOK_SECRET=<same secret as RevenueCat webhook>
MOBILE_STORE_BILLING_ENABLED=true
```
Redeploy. Confirm:
```bash
curl -s https://momentai.dev/api/mobile/compatibility | jq .features.storeBilling
# should print true
```

### Mobile release `.env` — **YOU** (on your Mac before archive)
```bash
cp .env.example .env
# edit:
VITE_API_BASE=https://momentai.dev
VITE_REVENUECAT_IOS_API_KEY=appl_...
VITE_APP_VERSION=1.0.0
# recommended:
VITE_SENTRY_DSN=...
VITE_GA4_MEASUREMENT_ID=...
```
Then:
```bash
npm run cap:sync
```

---

## Phase 5 — Supabase & deep links — **YOU** (+ agent for file edits)

### 5.1 Supabase Auth URL config — **YOU**
Dashboard → Authentication → URL Configuration → add Redirect URLs:
```text
https://momentai.dev/auth/callback
momentai://auth/callback
```

### 5.2 Apple Associated Domains — **YOU** in Xcode
1. `npx cap open ios`
2. Select **App** target → **Signing & Capabilities**
3. Choose your **Team** (auto-creates provisioning profile)
4. Confirm **Associated Domains** shows `applinks:momentai.dev`  
   (already in `ios/App/App/App.entitlements` — Xcode should pick it up once Team is set)

### 5.3 Fix AASA on server — **YOU provide Team ID → AGENT can edit → YOU deploy**
Replace in `apple-app-site-association`:
```json
"appID": "YOURTEAMID.dev.momentai.app"
```
File must be served as `application/json` (no `.json` extension) at:
`https://momentai.dev/.well-known/apple-app-site-association`

Test on device: password-reset email link should open the app after install.

---

## Phase 6 — Build for TestFlight — **YOU (Mac required)**

Agents cannot run Xcode archives or upload binaries.

```bash
cd momentai-mobile
git pull
npm install
# ensure .env has RevenueCat + version
npm run cap:sync
cd ios/App && pod install && cd ../..
npx cap open ios
```

In Xcode:
1. Select a **physical iPhone** (preferred) or Any iOS Device.
2. **Product → Archive**.
3. Organizer → **Distribute App** → **App Store Connect** → Upload.
4. Wait for processing in App Store Connect → **TestFlight**.

### Internal TestFlight — **YOU**
1. Add yourself as Internal Tester.
2. Install via TestFlight app.
3. Run the checklist in `docs/qa-matrix.md` (tick every iOS box).

### Sandbox IAP — **YOU**
1. App Store Connect → Users and Access → **Sandbox** → create a Sandbox Apple ID.
2. On iPhone: Settings → App Store → Sandbox Account (or sign out of media & purchases when prompted).
3. In MomentAI: open Paywall → Start 7 days free → complete sandbox purchase.
4. Confirm Plus unlocks; kill app; Restore purchases still works.

---

## Phase 7 — App Store listing metadata — **YOU**

In App Store Connect → App Information / Version:

| Field | Suggestion |
|-------|------------|
| Subtitle | Photo to Spotify playlist |
| Category | Music (primary), Photo & Video (secondary) |
| Privacy Policy URL | `https://momentai.dev/privacy.html` |
| Support URL | `https://momentai.dev` or a simple contact page |
| Description | One photo. One mood-matched Spotify playlist. Capture a moment, get a soundtrack. |
| Keywords | playlist,spotify,photo,mood,music,ai |
| Age Rating | Complete questionnaire (photos/UGC + music links → often 12+) |
| App Privacy | Declare: Email, Photos, User ID, Crash Data, Product Interaction |
| Export compliance | Uses standard encryption only (Info.plist already has `ITSAppUsesNonExemptEncryption = false`) |

### Screenshots — **YOU**
Capture from TestFlight on a recent iPhone (6.7" required). Suggested frames:
1. Now tab (hero card)
2. Capture viewfinder
3. Loading / reading the moment
4. Playlist result
5. Share card
6. Paywall

**Agent can** draft description/keyword text if you ask; **you** must upload screenshots.

---

## Phase 8 — App Review submission — **YOU**

1. Attach build from TestFlight.
2. **App Review Information** → provide:
   - Demo account email + password (create `review@…` ahead of time)
   - Notes: “Sign in → Capture this moment / center camera → allow camera or pick from roll → wait for playlist. Plus unlocks via Sandbox IAP. Discover/Friends tabs are intentionally empty (coming later).”
3. Answer encryption questionnaire.
4. Submit.

Typical review: 24–48 hours. Common rejection fixes:
- Paywall missing legal links → already addressed in readiness branch
- Broken demo account → verify before submit
- Incomplete Discover tab → explained in review notes

---

## Phase 9 — After approval — **YOU**

1. Release manually or automatically.
2. Monitor Sentry / RevenueCat / server logs.
3. Confirm webhook fires on real purchases (`users.tier` → `premium`).
4. Keep Play Store work as a parallel track (same app code; separate console, signing, Data Safety form).

---

## Parallel Android / Play notes (later)

| Step | Who |
|------|-----|
| Google Play Console account ($25 one-time) | YOU |
| Upload AAB, Data Safety form | YOU |
| Replace assetlinks SHA256 | YOU → AGENT edit → YOU deploy |
| RevenueCat Android key in `.env` | YOU |

---

## Status after this agent pass

**Done in code (agents):**
- BeReal UI (PR #3)
- Paywall subscription legal + Privacy/Terms/EULA links
- Auth modal legal links
- Manage subscription → Apple/Google subscription pages
- Hide unfinished camera flip
- Discover/Friends labeled as future update
- `PrivacyInfo.xcprivacy`
- Associated Domains entitlements file
- Export compliance flag + photo-add usage string
- Version aligned to `1.0.0`
- Web Privacy/Terms updated for IAP (needs merge + deploy)
- Maestro auth flow updated for You tab

**Still blocked on you:**
- Apple Developer enrollment + Team ID
- ASC app + subscription product
- RevenueCat keys + webhook secret + `MOBILE_STORE_BILLING_ENABLED`
- AASA Team ID + deploy
- Mac archive → TestFlight → screenshots → submit

When you finish Phase 1 and have a Team ID + RevenueCat iOS key, reply with those (or say “Team ID is X”) and an agent can finish the placeholder file updates and a final pre-submit checklist.
