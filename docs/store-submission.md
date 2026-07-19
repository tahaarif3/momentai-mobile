# Store submission notes

## Billing

- Premium unlock in the public native app **must** use StoreKit / Google Play Billing (RevenueCat).
- Do **not** expose Stripe Checkout CTAs in release native builds (`shouldShowStripeCheckout()` is false on native).
- RevenueCat webhook → MomentAi `POST /api/billing/revenuecat` syncs `users.tier` (needs `REVENUECAT_WEBHOOK_SECRET` on the API).
- Implement restore purchases (Paywall → Restore). Already wired when RevenueCat keys are set.

## Account deletion

- In-app delete with password re-auth → `DELETE /api/auth/account`
- Public web form: https://momentai.dev/delete-account.html (Google Play)

## Privacy / permissions

Already declared:

- iOS `Info.plist`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`
- Android: `CAMERA`, `READ_MEDIA_IMAGES`

Link Privacy / Terms from the app footer and Account screen.

## Deep links

- Universal Links / App Links preferred; `momentai://auth/callback` fallback
- Allowlist redirect URLs in Supabase
- Host AASA / assetlinks on `momentai.dev` (Phase 0 web branch has placeholders)

## Crash / analytics

- Set `VITE_SENTRY_DSN` + `VITE_GA4_MEASUREMENT_ID`
- Never log images, prompts, tokens, or emails
