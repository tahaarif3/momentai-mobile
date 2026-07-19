/**
 * Mobile analytics (Phase 5). Never send images, prompts, tokens, or emails.
 */

import { Capacitor } from '@capacitor/core';

const MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';

export function getPlatform() {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform(); // 'ios' | 'android'
}

/**
 * @param {string} name
 * @param {Record<string, string | number | boolean>} [params]
 */
export function track(name, params = {}) {
  const payload = {
    ...sanitize(params),
    platform: getPlatform(),
  };

  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, payload);
  }

  // GA4 / Sentry wiring in Phase 5 when measurement IDs are present.
  if (!MEASUREMENT_ID || typeof window.gtag !== 'function') return;
  window.gtag('event', name, payload);
}

function sanitize(params) {
  const blocked = /email|token|prompt|image|password|authorization/i;
  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (blocked.test(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
