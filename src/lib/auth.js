/**
 * Phase 2 — Supabase mobile auth (PKCE + Preferences + deep links).
 */

import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Browser } from '@capacitor/browser';
import { setAccessToken, syncAuthCallback, fetchMe, getApiBase, apiFetch } from './api.js';
import { track } from './analytics.js';

const STORAGE_KEY = 'momentai.supabase.session';

const preferencesStorage = {
  async getItem(key) {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setItem(key, value) {
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    await Preferences.remove({ key });
  },
};

let supabase = null;
let deepLinkReady = false;

export function getSupabase() {
  return supabase;
}

export function isAuthConfigured() {
  return Boolean(supabase);
}

export function authRedirectUrl() {
  return import.meta.env.VITE_AUTH_REDIRECT_URL || 'momentai://auth/callback';
}

export async function initAuth({ onSession } = {}) {
  let url = import.meta.env.VITE_SUPABASE_URL;
  let anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/config`);
      const cfg = await res.json();
      url = cfg.supabaseUrl;
      anon = cfg.supabaseAnonKey;
    } catch (err) {
      console.warn('Failed to load auth config', err);
    }
  }

  if (!url || !anon) {
    console.warn('Supabase not configured');
    return null;
  }

  supabase = createClient(url, anon, {
    auth: {
      storage: Capacitor.isNativePlatform() ? preferencesStorage : localStorage,
      storageKey: STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      flowType: 'pkce',
    },
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    setAccessToken(session?.access_token || null);
    if (
      session?.access_token &&
      (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')
    ) {
      try {
        await syncAuthCallback();
        const me = await fetchMe();
        onSession?.(me.loggedIn ? me.user : null, session);
      } catch (err) {
        console.warn('Auth sync failed', err);
        onSession?.(null, session);
      }
    } else if (event === 'SIGNED_OUT') {
      onSession?.(null, null);
    }
  });

  // Browser: handle redirect callback if present
  if (!Capacitor.isNativePlatform() && typeof window !== 'undefined') {
    const href = window.location.href;
    if (href.includes('code=') || href.includes('access_token=')) {
      try {
        await handleAuthCallbackUrl(href);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.warn('[auth] browser callback failed', err);
      }
    }
  }

  const { data } = await supabase.auth.getSession();
  setAccessToken(data.session?.access_token || null);
  if (data.session) {
    try {
      await syncAuthCallback();
      const me = await fetchMe();
      onSession?.(me.loggedIn ? me.user : null, data.session);
    } catch {
      onSession?.(null, data.session);
    }
  }

  await setupDeepLinks(onSession);
  return supabase;
}

async function setupDeepLinks(onSession) {
  if (deepLinkReady || !Capacitor.isNativePlatform()) return;
  deepLinkReady = true;

  await App.addListener('appUrlOpen', async ({ url }) => {
    console.log('[auth] appUrlOpen', url);
    try {
      await handleAuthCallbackUrl(url);
      try {
        await Browser.close();
      } catch {
        /* ignore */
      }
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token || null);
      if (data.session) {
        await syncAuthCallback();
        const me = await fetchMe();
        onSession?.(me.loggedIn ? me.user : null, data.session);
        track('auth_callback_success');
      }
    } catch (err) {
      console.error('[auth] deep link handling failed', err);
      track('auth_callback_failed', { reason: 'exchange' });
    }
  });
}

/**
 * Parse Universal Link / momentai://auth/callback and exchange PKCE code for session.
 */
export async function handleAuthCallbackUrl(url) {
  if (!supabase || !url) return null;

  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const errorDescription = parsed.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    setAccessToken(data.session?.access_token || null);
    return data.session;
  }

  const hash = parsed.hash?.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  if (hash) {
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      setAccessToken(data.session?.access_token || null);
      return data.session;
    }
  }

  // Also accept query-string tokens
  const accessToken = parsed.searchParams.get('access_token');
  const refreshToken = parsed.searchParams.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    setAccessToken(data.session?.access_token || null);
    return data.session;
  }

  return null;
}

export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setAccessToken(data.session?.access_token || null);
  await syncAuthCallback();
  return data;
}

export async function signUp(email, password) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
  if (data.session) {
    setAccessToken(data.session.access_token);
    await syncAuthCallback();
  }
  return data;
}

export async function resetPassword(email) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl(),
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  setAccessToken(null);
  await Preferences.remove({ key: STORAGE_KEY });
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    /* ignore */
  }
}
