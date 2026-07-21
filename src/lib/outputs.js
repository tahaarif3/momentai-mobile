/**
 * Multi-target playlist output helpers (Odesli share URL + Apple Music).
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Browser } from '@capacitor/browser';
import { getApiBase, apiFetch } from './api.js';
import { track, captureError, platformName } from './analytics.js';
import AppleMusicNative from './appleMusic.js';
/** @type {Record<string, boolean>} */
let serverFeatures = {
  multiTargetLinks: true,
  appleMusicSave: false,
  appleMusicDevToken: false,
};

export function setOutputFeatures(features = {}) {
  serverFeatures = {
    ...serverFeatures,
    ...features,
  };
}

export function getOutputFeatures() {
  return { ...serverFeatures };
}

export function isAppleMusicEnabled() {
  const envFlag = import.meta.env.VITE_APPLE_ENABLED;
  if (envFlag === 'false' || envFlag === '0') return false;
  if (envFlag === 'true' || envFlag === '1') return true;
  return Boolean(serverFeatures.appleMusicSave || serverFeatures.appleMusicDevToken);
}

export function publicPlaylistUrl(generationId) {
  if (!generationId) return null;
  return `${getApiBase()}/p/${generationId}`;
}

/**
 * Share / Open anywhere — Capacitor Share of /p/:id with clipboard fallback.
 */
export async function shareOpenAnywhere({ generationId, title, shareUrl }) {
  const url = shareUrl || publicPlaylistUrl(generationId);
  if (!url) {
    throw new Error('Save or generate a playlist first to get a share link.');
  }

  const text = title
    ? `${title} — open in your music app via MomentAI`
    : 'My MomentAI playlist — open anywhere';

  track('playlist_share', {
    target: 'odesli',
    playlist_id: generationId || 'unknown',
  });

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: title || 'MomentAI',
        text,
        url,
        dialogTitle: 'Share / Open anywhere',
      });
      return { via: 'share', url };
    } catch (err) {
      // User dismiss or share unavailable → clipboard fallback
      if (String(err?.message || '').toLowerCase().includes('cancel')) {
        return { via: 'cancelled', url };
      }
    }
  }

  try {
    await Clipboard.write({ string: url });
    return { via: 'clipboard', url };
  } catch {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { via: 'clipboard', url };
    }
    // Last resort: open the page
    await Browser.open({ url });
    return { via: 'browser', url };
  }
}

export async function fetchAppleDevToken() {
  const res = await apiFetch('/api/apple/dev-token');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Apple Music unavailable');
    err.status = res.status;
    throw err;
  }
  return data.token;
}

export async function fetchPlaylistLinks(generationId) {
  const res = await apiFetch(`/api/playlist/generation/${generationId}/links`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Failed to load playlist links');
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Save playlist to the user's Apple Music library.
 * iOS: native MusicKit Capacitor plugin.
 * Android / web: feature-detect; toast not-yet when unsupported.
 */
export async function saveToAppleMusic({ generationId, name, description, tracks }) {
  const platform = platformName();
  const catalogIds = (tracks || [])
    .map((t) => t.appleCatalogId)
    .filter(Boolean);

  let matched = catalogIds;
  let trackCount = (tracks || []).length;

  // Prefer server-resolved catalog IDs when tracks lack them
  if (generationId && matched.length === 0) {
    try {
      const links = await fetchPlaylistLinks(generationId);
      trackCount = links.trackCount || links.tracks?.length || trackCount;
      matched = (links.tracks || []).map((t) => t.appleCatalogId).filter(Boolean);
    } catch (err) {
      captureError(err, { where: 'apple_links' });
    }
  }

  if (!matched.length) {
    const err = new Error('No tracks matched Apple Music yet. Try again in a moment.');
    err.code = 'NO_MATCHES';
    throw err;
  }

  const breadcrumb = {
    target: 'apple_music',
    platform,
    playlist_id: generationId || 'unknown',
    track_count: trackCount,
    matched_count: matched.length,
  };

  if (Capacitor.getPlatform() === 'ios') {
    try {
      // Ensure MusicKit has a developer token from our API
      const developerToken = await fetchAppleDevToken();
      await AppleMusicNative.authorize({ developerToken });
      const result = await AppleMusicNative.createPlaylist({
        name: name || 'MomentAI Playlist',
        description: description || '',
        catalogIds: matched,
      });
      track('playlist_save', breadcrumb);
      return {
        success: true,
        playlistId: result?.playlistId || null,
        matchedCount: matched.length,
        trackCount,
        platform: 'ios',
      };
    } catch (err) {
      captureError(err, { where: 'apple_music_ios' });
      // Plugin missing or MusicKit unavailable
      if (
        String(err?.message || '')
          .toLowerCase()
          .includes('not implemented') ||
        err?.code === 'UNIMPLEMENTED'
      ) {
        const e = new Error('Apple Music save needs a native build with MusicKit enabled.');
        e.code = 'PLUGIN_MISSING';
        throw e;
      }
      throw err;
    }
  }

  // Android fast-follow: open first Apple Music track / playlist page for now
  if (Capacitor.getPlatform() === 'android') {
    track('playlist_save', { ...breadcrumb, mode: 'deep_link_fallback' });
    const first = (tracks || []).find((t) => t.appleCatalogId || t.appleUrl);
    const url =
      first?.appleUrl ||
      (matched[0] ? `https://music.apple.com/song/${matched[0]}` : null) ||
      publicPlaylistUrl(generationId);
    if (url) await Browser.open({ url });
    return {
      success: true,
      matchedCount: matched.length,
      trackCount,
      platform: 'android',
      mode: 'deep_link_fallback',
    };
  }

  // Browser preview
  track('playlist_save', { ...breadcrumb, mode: 'web_preview' });
  const url = publicPlaylistUrl(generationId);
  if (url) await Browser.open({ url });
  return {
    success: true,
    matchedCount: matched.length,
    trackCount,
    platform: 'web',
    mode: 'web_preview',
  };
}
