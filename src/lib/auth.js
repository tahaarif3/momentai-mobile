/**
 * Supabase mobile auth (Phase 2 implementation surface).
 * Phase 1 wires deep-link listeners and Preferences-backed session stubs.
 */

import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { createClient } from '@supabase/supabase-js';
import { setAccessToken } from './api.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SESSION_KEY = 'momentai.supabase.session';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;
let urlOpenHandle = null;

const preferencesAdapter = {
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

export function isAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!isAuthConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: preferencesAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return client;
}

export async function initAuth() {
  const sb = getSupabase();
  if (!sb) {
    setAccessToken(null);
    return { configured: false, session: null };
  }

  const { data } = await sb.auth.getSession();
  const session = data.session;
  setAccessToken(session?.access_token || null);

  sb.auth.onAuthStateChange((_event, next) => {
    setAccessToken(next?.access_token || null);
  });

  if (!urlOpenHandle) {
    urlOpenHandle = await App.addListener('appUrlOpen', async ({ url }) => {
      await handleAuthCallbackUrl(url);
    });
  }

  return { configured: true, session };
}

/**
 * Universal Links / App Links / momentai:// fallback callback handler.
 * Full PKCE exchange lands in Phase 2.
 */
export async function handleAuthCallbackUrl(url) {
  const sb = getSupabase();
  if (!sb || !url) return null;

  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error) throw error;
      setAccessToken(data.session?.access_token || null);
      await Preferences.set({
        key: SESSION_KEY,
        value: JSON.stringify({ updatedAt: Date.now() }),
      });
      return data.session;
    }

    const accessToken = parsed.searchParams.get('access_token');
    const refreshToken = parsed.searchParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await sb.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      setAccessToken(data.session?.access_token || null);
      return data.session;
    }
  } catch (err) {
    console.warn('[auth] callback failed', err);
  }

  return null;
}

export async function signInWithPassword(email, password) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setAccessToken(data.session?.access_token || null);
  return data;
}

export async function signUp(email, password) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  setAccessToken(data.session?.access_token || null);
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  setAccessToken(null);
  await Preferences.remove({ key: SESSION_KEY });
}
