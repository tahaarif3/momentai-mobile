/**
 * Phase 6 stub — StoreKit / Play via RevenueCat.
 * Public native builds must not open Stripe Checkout.
 */

import { Capacitor } from '@capacitor/core';

export function isNativeBilling() {
  return Capacitor.isNativePlatform();
}

export function shouldShowStripeCheckout() {
  return !Capacitor.isNativePlatform();
}

export async function initBilling(_appUserId) {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'web' };
  const platform = Capacitor.getPlatform();
  const apiKey =
    platform === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_API_KEY
      : import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY;
  if (!apiKey) return { ok: false, reason: 'missing_key' };
  // RevenueCat SDK wiring lands with store keys in Phase 6.
  return { ok: false, reason: 'not_wired' };
}

export async function purchasePlus() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Use web Stripe Checkout on momentai.dev for browser billing');
  }
  throw new Error('RevenueCat / store purchases not wired yet (Phase 6)');
}

export async function purchasePremium() {
  return purchasePlus();
}

export async function restorePurchases() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Restore is only available in native builds');
  }
  throw new Error('RevenueCat restore not wired yet (Phase 6)');
}

export function getEntitlementSnapshot() {
  return { tier: 'free', source: 'local-stub' };
}
