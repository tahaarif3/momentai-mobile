/**
 * Store billing surface (Phase 6).
 * Public native builds must not open Stripe Checkout — RevenueCat / StoreKit / Play Billing only.
 */

import { Capacitor } from '@capacitor/core';

const NATIVE_BUILD = Capacitor.isNativePlatform();

export function isNativeBillingRequired() {
  return NATIVE_BUILD;
}

/**
 * Purchase Plus entitlement. Stub until RevenueCat SDK is wired.
 */
export async function purchasePlus() {
  if (!NATIVE_BUILD) {
    throw new Error('Use web Stripe Checkout on momentai.dev for browser billing');
  }
  throw new Error('RevenueCat / store purchases not wired yet (Phase 6)');
}

export async function restorePurchases() {
  if (!NATIVE_BUILD) {
    throw new Error('Restore is only available in native builds');
  }
  throw new Error('RevenueCat restore not wired yet (Phase 6)');
}

export function getEntitlementSnapshot() {
  return {
    tier: 'free',
    source: 'local-stub',
  };
}
