/**
 * Phase 6 — StoreKit / Play Billing via RevenueCat.
 * Public native builds must NOT open Stripe Checkout.
 */

import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { track } from './analytics.js';

const ENTITLEMENT = import.meta.env.VITE_REVENUECAT_ENTITLEMENT_ID || 'premium';

let configured = false;

export function isNativeBilling() {
  return Capacitor.isNativePlatform();
}

/** Hide Stripe CTAs in native public builds */
export function shouldShowStripeCheckout() {
  return !Capacitor.isNativePlatform();
}

function platformApiKey() {
  const platform = Capacitor.getPlatform();
  return platform === 'ios'
    ? import.meta.env.VITE_REVENUECAT_IOS_API_KEY
    : import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY;
}

export async function initBilling(appUserId) {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'web' };

  const apiKey = platformApiKey();
  if (!apiKey) {
    console.warn('[billing] RevenueCat API key missing for', Capacitor.getPlatform());
    return { ok: false, reason: 'missing_key' };
  }

  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.INFO });
    await Purchases.configure({
      apiKey,
      appUserID: appUserId || undefined,
    });
    configured = true;
    if (appUserId) {
      await Purchases.logIn({ appUserID: appUserId });
    }
    track('billing_configured', { ok: true });
    return { ok: true };
  } catch (err) {
    console.error('[billing] configure failed', err);
    configured = false;
    return { ok: false, reason: err?.message || 'configure_failed' };
  }
}

export async function getOfferings() {
  if (!configured) return null;
  const { offerings } = await Purchases.getOfferings();
  return offerings;
}

export async function purchasePremium() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Use web Stripe Checkout on momentai.dev for browser billing');
  }
  if (!configured) {
    throw new Error('Store billing not configured — set VITE_REVENUECAT_* keys for this platform');
  }

  const offerings = await getOfferings();
  const pkg = offerings?.current?.availablePackages?.[0];
  if (!pkg) throw new Error('No subscription packages available in RevenueCat');

  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  const active = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT]);
  track('purchase_complete', { active: !!active });
  return { customerInfo, active };
}

export async function purchasePlus() {
  return purchasePremium();
}

export async function restorePurchases() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Restore is only available in native builds');
  }
  if (!configured) {
    throw new Error('Store billing not configured — set VITE_REVENUECAT_* keys');
  }
  const { customerInfo } = await Purchases.restorePurchases();
  const active = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT]);
  track('purchase_restore', { active: !!active });
  return { customerInfo, active };
}

export async function hasPremiumEntitlement() {
  if (!configured) return false;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT]);
}

export function getEntitlementSnapshot() {
  return {
    tier: configured ? 'unknown' : 'free',
    source: configured ? 'revenuecat' : 'local-stub',
    configured,
  };
}

export function isBillingConfigured() {
  return configured;
}
