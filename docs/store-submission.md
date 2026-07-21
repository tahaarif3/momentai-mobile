# Store submission notes

See **[app-store-launch-plan.md](./app-store-launch-plan.md)** for the full Apple Developer → TestFlight → App Review checklist (AI vs manual steps).

## Billing

- Premium unlock in the public native app **must** use StoreKit / Google Play Billing (RevenueCat).
- Do **not** expose Stripe Checkout CTAs in release native builds (`shouldShowStripeCheckout()` is false on native).
- RevenueCat webhook → MomentAi `POST /api/billing/revenuecat` syncs `users.tier` (needs `REVENUECAT_WEBHOOK_SECRET` on the API).
- Set `MOBILE_STORE_BILLING_ENABLED=true` on the API so `/api/mobile/compatibility` reports `storeBilling: true`.
- Implement restore purchases (Paywall → Restore). Already wired when RevenueCat keys are set.
- Paywall includes auto-renewal disclosure + Privacy / Terms / Apple EULA links (Guideline 3.1.2).
- Live price is loaded from RevenueCat offerings when configured; static `$4.00` is a fallback only.

## Account deletion

- In-app delete with password re-auth → `DELETE /api/auth/account` (You tab)
- Public web form: https://momentai.dev/delete-account.html (Google Play)

## Privacy / permissions

Already declared:

- iOS `Info.plist`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`
- iOS `PrivacyInfo.xcprivacy` (email, photos, user ID, crash, product interaction; UserDefaults + file timestamp reasons)
- iOS `ITSAppUsesNonExemptEncryption = false`
- Associated Domains: `applinks:momentai.dev` in `App.entitlements`
- Android: `CAMERA`, `READ_MEDIA_IMAGES`

Link Privacy / Terms from Profile, Auth modal, and Paywall.

## Deep links

- Universal Links / App Links preferred; `momentai://auth/callback` fallback
- Allowlist redirect URLs in Supabase
- Host AASA / assetlinks on `momentai.dev` — replace `TEAMID` and Play SHA before release

## Crash / analytics

- Set `VITE_SENTRY_DSN` + `VITE_GA4_MEASUREMENT_ID`
- Never log images, prompts, tokens, or emails
