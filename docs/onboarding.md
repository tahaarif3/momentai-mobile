# First-run onboarding

Implements the design handoff **MomentAI — Onboarding Flow (iOS)** as a Capacitor / vanilla JS screen.

## Flow

`Welcome → Genres → Social proof → Auth → Camera → Notifications → Paywall → All set → Capture`

- Progress bar on every step except welcome / done
- Genres require ≥1 selection (sticky CTA gated)
- Permission primers fire native requests only on Allow; secondary CTAs advance without requesting
- Paywall “Maybe later” appears after a **2s dwell**
- Completion persists `momentai_onboarded` + selected genres via Capacitor Preferences
- Finish hands off to the Capture screen

## Files

| File | Role |
| --- | --- |
| `src/lib/onboarding.js` | Step machine, Preferences, permission primers, render |
| `index.html` `#screenOnboarding` | Markup for all 8 steps |
| `src/styles/main.css` | Onboarding tokens / layout |
| `src/main.js` | First-run gate in `boot()` |

## Reset for QA

In a native WebView / browser console with Preferences available, or temporarily call:

```js
import { resetOnboarding } from './lib/onboarding.js';
await resetOnboarding();
location.reload();
```

## Not ported from the handoff

- `ios-frame.jsx` device chrome (prototype only)
- Real Sign in with Apple / Google OAuth (buttons open the existing email auth modal; email path is live)
