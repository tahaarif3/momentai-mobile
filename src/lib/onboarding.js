/**
 * First-run onboarding — 8-step flow from design handoff.
 * Welcome → Genres → Social → Auth → Camera → Notifications → Paywall → Done
 */

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { track } from './analytics.js';

const ONBOARDED_KEY = 'momentai_onboarded';
const GENRES_KEY = 'momentai_taste_genres';
const PLAN_KEY = 'momentai_onboard_plan';

export const ONBOARD_STEPS = [
  'welcome',
  'genres',
  'social',
  'auth',
  'camera',
  'notif',
  'paywall',
  'done',
];

export const GENRE_OPTIONS = [
  { key: 'indie', label: 'Indie', emoji: '🎸' },
  { key: 'lofi', label: 'Lo-fi', emoji: '🌙' },
  { key: 'rnb', label: 'R&B', emoji: '💜' },
  { key: 'electronic', label: 'Electronic', emoji: '⚡' },
  { key: 'hiphop', label: 'Hip-hop', emoji: '🎤' },
  { key: 'jazz', label: 'Jazz', emoji: '🎷' },
  { key: 'ambient', label: 'Ambient', emoji: '🌫️' },
  { key: 'pop', label: 'Pop', emoji: '✨' },
  { key: 'classical', label: 'Classical', emoji: '🎻' },
  { key: 'rock', label: 'Rock', emoji: '🔥' },
];

/** @type {{ step: number, selected: Record<string, boolean>, plan: 'weekly'|'annual', showLater: boolean }} */
let state = {
  step: 0,
  selected: {},
  plan: 'annual',
  showLater: false,
};

let laterTimer = null;
/** @type {null | ((info: { genres: string[], plan: string }) => void)} */
let finishHandler = null;

export function getOnboardingState() {
  return {
    step: state.step,
    stepName: ONBOARD_STEPS[state.step],
    selected: { ...state.selected },
    plan: state.plan,
    showLater: state.showLater,
    selectedCount: Object.keys(state.selected).length,
  };
}

export async function hasCompletedOnboarding() {
  const { value } = await Preferences.get({ key: ONBOARDED_KEY });
  return value === '1' || value === 'true';
}

export async function markOnboardingComplete() {
  await Preferences.set({ key: ONBOARDED_KEY, value: '1' });
}

/** Dev / QA helper */
export async function resetOnboarding() {
  await Preferences.remove({ key: ONBOARDED_KEY });
}

export async function loadSavedGenres() {
  const { value } = await Preferences.get({ key: GENRES_KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSelectedGenres(keys) {
  await Preferences.set({ key: GENRES_KEY, value: JSON.stringify(keys || []) });
}

export async function savePreferredPlan(plan) {
  await Preferences.set({ key: PLAN_KEY, value: plan || 'annual' });
}

function clearLaterTimer() {
  if (laterTimer) {
    clearTimeout(laterTimer);
    laterTimer = null;
  }
}

function go(stepIndex) {
  const clamped = Math.max(0, Math.min(ONBOARD_STEPS.length - 1, stepIndex));
  clearLaterTimer();
  state = { ...state, step: clamped, showLater: false };
  if (ONBOARD_STEPS[clamped] === 'paywall') {
    laterTimer = setTimeout(() => {
      state = { ...state, showLater: true };
      renderOnboarding();
    }, 2000);
  }
  renderOnboarding();
}

export function nextStep() {
  const cur = ONBOARD_STEPS[state.step];
  if (cur === 'genres' && Object.keys(state.selected).length < 1) {
    return false;
  }
  if (cur === 'done') {
    finishOnboarding();
    return true;
  }
  go(state.step + 1);
  return true;
}

export function prevStep() {
  if (state.step <= 0) return;
  go(state.step - 1);
}

export function skipStep() {
  // Auth hides Skip in the design; still allow programmatic advance
  go(state.step + 1);
}

export function toggleGenre(key) {
  const selected = { ...state.selected };
  if (selected[key]) delete selected[key];
  else selected[key] = true;
  state = { ...state, selected };
  renderOnboarding();
}

export function setPlan(plan) {
  if (plan !== 'weekly' && plan !== 'annual') return;
  state = { ...state, plan };
  renderOnboarding();
}

export async function finishOnboarding() {
  clearLaterTimer();
  const genres = Object.keys(state.selected);
  await saveSelectedGenres(genres);
  await savePreferredPlan(state.plan);
  await markOnboardingComplete();
  track('onboarding_complete', {
    genre_count: genres.length,
    plan: state.plan,
  });
  finishHandler?.({ genres, plan: state.plan });
}

/**
 * Request camera permission (primer CTA). Never blocks the flow.
 * @returns {Promise<'granted'|'denied'|'unavailable'>}
 */
export async function requestOnboardingCameraPermission() {
  try {
    if (!Capacitor.isNativePlatform()) {
      track('onboarding_camera', { status: 'web_skip' });
      return 'unavailable';
    }
    const req = await Camera.requestPermissions({ permissions: ['camera'] });
    const status = req.camera === 'granted' || req.camera === 'limited' ? 'granted' : 'denied';
    track('onboarding_camera', { status });
    return status;
  } catch {
    track('onboarding_camera', { status: 'error' });
    return 'unavailable';
  }
}

/**
 * Request notification permission (primer CTA). Best-effort.
 */
export async function requestOnboardingNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      const status = await Notification.requestPermission();
      track('onboarding_notifications', { status });
      return status;
    }
    track('onboarding_notifications', { status: 'unavailable' });
    return 'unavailable';
  } catch {
    track('onboarding_notifications', { status: 'error' });
    return 'unavailable';
  }
}

function $(id) {
  return document.getElementById(id);
}

function progressPct() {
  const total = ONBOARD_STEPS.length - 1;
  return Math.round((state.step / total) * 100);
}

export function renderOnboarding(opts = {}) {
  const root = $('screenOnboarding');
  if (!root) return;

  const cur = ONBOARD_STEPS[state.step];
  const selCount = Object.keys(state.selected).length;
  const genresReady = selCount >= 1;
  const userName = opts.userName || 'friend';

  root.querySelectorAll('[data-onboard-step]').forEach((el) => {
    el.hidden = el.dataset.onboardStep !== cur;
  });

  const progress = $('onboardProgress');
  if (progress) {
    progress.hidden = cur === 'welcome' || cur === 'done';
  }
  const fill = $('onboardProgressFill');
  if (fill) fill.style.width = `${progressPct()}%`;

  const skipBtn = $('onboardSkip');
  if (skipBtn) {
    skipBtn.hidden = cur === 'auth' || cur === 'welcome' || cur === 'done';
    skipBtn.textContent = 'Skip';
  }

  // Genres cards selected state
  root.querySelectorAll('[data-genre]').forEach((btn) => {
    const on = Boolean(state.selected[btn.dataset.genre]);
    btn.classList.toggle('is-selected', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  // Sticky CTA
  const sticky = $('onboardSticky');
  const stickyBtn = $('onboardStickyCta');
  const laterBtn = $('onboardMaybeLater');
  const showSticky = cur === 'genres' || cur === 'social' || cur === 'paywall';
  if (sticky) sticky.hidden = !showSticky;

  if (stickyBtn) {
    if (cur === 'genres') {
      stickyBtn.textContent = genresReady ? `Continue (${selCount})` : 'Pick at least one';
      stickyBtn.disabled = !genresReady;
      stickyBtn.classList.toggle('is-disabled', !genresReady);
    } else if (cur === 'paywall') {
      stickyBtn.textContent =
        state.plan === 'annual' ? 'Start 7 days free' : 'Go Plus — $1.99/week';
      stickyBtn.disabled = false;
      stickyBtn.classList.toggle('is-disabled', false);
    } else {
      stickyBtn.textContent = 'Sounds good';
      stickyBtn.disabled = false;
      stickyBtn.classList.toggle('is-disabled', false);
    }
  }

  if (laterBtn) {
    laterBtn.hidden = !(cur === 'paywall' && state.showLater);
  }

  // Plan rows
  root.querySelectorAll('[data-plan]').forEach((row) => {
    const on = row.dataset.plan === state.plan;
    row.classList.toggle('is-selected', on);
    row.setAttribute('aria-checked', on ? 'true' : 'false');
  });

  const doneName = $('onboardDoneName');
  if (doneName) doneName.textContent = userName;
}

/**
 * Bind DOM once. Call after HTML is present.
 * @param {{
 *   onFinish: (info: { genres: string[], plan: string }) => void,
 *   onSignIn: () => void,
 *   onAuthEmail: (email: string) => void | Promise<void>,
 *   onPurchase: (plan: 'weekly'|'annual') => void | Promise<void>,
 *   getUserName?: () => string,
 * }} handlers
 */
export function bindOnboarding(handlers) {
  finishHandler = handlers.onFinish;

  $('onboardBack')?.addEventListener('click', () => prevStep());
  $('onboardSkip')?.addEventListener('click', () => skipStep());

  $('btnOnboardStart')?.addEventListener('click', () => nextStep());
  $('btnOnboardSignIn')?.addEventListener('click', () => {
    track('onboarding_sign_in_tap');
    handlers.onSignIn?.();
  });

  document.querySelectorAll('[data-genre]').forEach((btn) => {
    btn.addEventListener('click', () => toggleGenre(btn.dataset.genre));
  });

  $('onboardStickyCta')?.addEventListener('click', async () => {
    const cur = ONBOARD_STEPS[state.step];
    if (cur === 'genres' && Object.keys(state.selected).length < 1) return;
    if (cur === 'paywall') {
      try {
        await handlers.onPurchase?.(state.plan);
      } catch {
        /* purchase failure still allows continuing via Maybe later */
      }
      nextStep();
      return;
    }
    nextStep();
  });

  $('onboardMaybeLater')?.addEventListener('click', () => {
    track('onboarding_paywall_skip');
    nextStep();
  });

  $('btnOnboardApple')?.addEventListener('click', () => {
    track('onboarding_auth_provider', { provider: 'apple' });
    handlers.onSignIn?.();
    // Email/password is the live path today; don't trap the flow waiting on OAuth.
    nextStep();
  });
  $('btnOnboardGoogle')?.addEventListener('click', () => {
    track('onboarding_auth_provider', { provider: 'google' });
    handlers.onSignIn?.();
    nextStep();
  });
  $('btnOnboardEmail')?.addEventListener('click', async () => {
    const email = $('onboardEmail')?.value?.trim() || '';
    track('onboarding_auth_provider', { provider: 'email' });
    await handlers.onAuthEmail?.(email);
    // Advance after launching auth — user can complete modal; don't block
    nextStep();
  });
  $('btnOnboardAuthSkip')?.addEventListener('click', () => {
    track('onboarding_auth_skip');
    nextStep();
  });

  $('btnOnboardCameraAllow')?.addEventListener('click', async () => {
    await requestOnboardingCameraPermission();
    nextStep();
  });
  $('btnOnboardCameraSkip')?.addEventListener('click', () => nextStep());

  $('btnOnboardNotifAllow')?.addEventListener('click', async () => {
    await requestOnboardingNotificationPermission();
    nextStep();
  });
  $('btnOnboardNotifSkip')?.addEventListener('click', () => nextStep());

  document.querySelectorAll('[data-plan]').forEach((row) => {
    row.addEventListener('click', () => setPlan(row.dataset.plan));
  });

  $('btnOnboardFinish')?.addEventListener('click', () => finishOnboarding());

  registerScreenHook(handlers.getUserName);
}

function registerScreenHook(getUserName) {
  // Re-render when shown
  const nameFn = typeof getUserName === 'function' ? getUserName : () => 'friend';
  const originalRender = () => renderOnboarding({ userName: nameFn() || 'friend' });
  // Expose for external refresh after auth
  bindOnboarding.refresh = originalRender;
}

export function startOnboarding(userName = 'friend') {
  state = { step: 0, selected: {}, plan: 'annual', showLater: false };
  clearLaterTimer();
  track('onboarding_start');
  renderOnboarding({ userName });
}

export { ONBOARDED_KEY, GENRES_KEY };
