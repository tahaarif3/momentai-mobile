/**
 * HTTP client for the MomentAI API (docs/mobile-api.md in MomentAi web repo).
 * Base: VITE_API_BASE (default https://momentai.dev)
 * Auth: Authorization Bearer <supabase_access_token>
 * Jobs: progressToken query / X-Progress-Token or owner JWT
 */

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://momentai.dev').replace(/\/$/, '');

let accessToken = null;

export function getApiBase() {
  return API_BASE;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
}

export async function fetchCompatibility() {
  const res = await apiFetch('/api/mobile/compatibility');
  if (!res.ok) throw new Error('Compatibility check failed');
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Compatibility endpoint returned non-JSON (Phase 0 not deployed?)');
  }
  return res.json();
}

export async function processImage(file, customPrompt = '') {
  const form = new FormData();
  form.append('image', file, file.name || 'moment.jpg');
  if (customPrompt.trim()) form.append('customPrompt', customPrompt.trim());
  const res = await apiFetch('/api/playlist/process', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Upload failed');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function pollJob(jobId, progressToken) {
  const q = progressToken ? `?progressToken=${encodeURIComponent(progressToken)}` : '';
  const res = await apiFetch(`/api/playlist/job/${jobId}${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Job status failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function jobStreamUrl(jobId, progressToken) {
  const q = progressToken ? `?progressToken=${encodeURIComponent(progressToken)}` : '';
  return `${API_BASE}/api/playlist/job/${jobId}/stream${q}`;
}

export async function fetchHistory() {
  const res = await apiFetch('/api/playlist/history');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'History failed');
  return data;
}

export async function fetchGeneration(id) {
  const res = await apiFetch(`/api/playlist/generation/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Load moment failed');
  return data;
}

export async function deleteGeneration(id) {
  const res = await apiFetch(`/api/playlist/generation/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Delete failed');
  return data;
}

export async function savePlaylist({ playlistName, playlistDescription, trackUris, generationId }) {
  const res = await apiFetch('/api/playlist/save', {
    method: 'POST',
    body: JSON.stringify({ playlistName, playlistDescription, trackUris, generationId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Save failed');
  return data;
}

export async function suggestMore({ metadata, excludeTrackIds, customPrompt }) {
  const res = await apiFetch('/api/playlist/suggest-more', {
    method: 'POST',
    body: JSON.stringify({ metadata, excludeTrackIds, customPrompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Suggest more failed');
  return data;
}

export async function regenerate(generationId) {
  const res = await apiFetch('/api/playlist/regenerate', {
    method: 'POST',
    body: JSON.stringify({ generationId }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'Regenerate failed');
    err.code = data.code;
    throw err;
  }
  return data;
}

export async function deleteAccount() {
  const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Account deletion failed');
  return data;
}

export async function syncAuthCallback() {
  const res = await apiFetch('/api/auth/callback', { method: 'POST', body: '{}' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Auth sync failed');
  return data;
}

export async function fetchMe() {
  const res = await apiFetch('/api/auth/me');
  return res.json();
}
