import { Capacitor } from '@capacitor/core';

const GA_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';

export function platformName() {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform();
}

export function getPlatform() {
  return platformName();
}

export function initObservability() {
  if (!GA_ID || typeof window === 'undefined') return;
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
  window.gtag('config', GA_ID, { platform: platformName(), send_page_view: true });
}

/**
 * Never send images, prompts, tokens, or emails.
 */
export function track(name, params = {}) {
  const safe = { ...params, platform: platformName() };
  for (const key of Object.keys(safe)) {
    const k = key.toLowerCase();
    if (
      k.includes('email') ||
      k.includes('token') ||
      k.includes('prompt') ||
      k.includes('image') ||
      k.includes('password')
    ) {
      delete safe[key];
    }
  }
  if (typeof window !== 'undefined' && typeof window.gtag === 'function' && GA_ID) {
    window.gtag('event', name, safe);
  }
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, safe);
  }
}

export function captureError(err) {
  console.error(err);
  track('app_error', { name: err?.name || 'Error' });
}
