/**
 * Phase 5 — GA4 + Sentry observability.
 * Never send images, prompts, tokens, or email addresses.
 */

import { Capacitor } from '@capacitor/core';
import * as Sentry from '@sentry/browser';

const GA_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

let sentryReady = false;

export function platformName() {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform();
}

export function getPlatform() {
  return platformName();
}

export function initObservability() {
  if (GA_ID && typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function gtag() {
        window.dataLayer.push(arguments);
      };
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      platform: platformName(),
      send_page_view: true,
    });
  }

  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
          delete event.user.username;
        }
        return event;
      },
    });
    sentryReady = true;
  }
}

function sanitize(params = {}) {
  const safe = { ...params, platform: platformName() };
  for (const key of Object.keys(safe)) {
    const k = key.toLowerCase();
    if (
      k.includes('email') ||
      k.includes('token') ||
      k.includes('prompt') ||
      k.includes('image') ||
      k.includes('password') ||
      k.includes('authorization')
    ) {
      delete safe[key];
    }
  }
  return safe;
}

/**
 * @param {string} name
 * @param {Record<string, string | number | boolean>} [params]
 */
export function track(name, params = {}) {
  const safe = sanitize(params);
  if (typeof window !== 'undefined' && typeof window.gtag === 'function' && GA_ID) {
    window.gtag('event', name, safe);
  }
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, safe);
  }
}

export function captureError(err, context = {}) {
  console.error(err);
  if (sentryReady) {
    Sentry.captureException(err, {
      extra: sanitize({ ...context, errName: err?.name || 'Error' }),
    });
  }
  track('app_error', { name: err?.name || 'Error' });
}
