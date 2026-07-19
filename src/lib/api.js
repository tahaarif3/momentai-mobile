/**
 * HTTP client for the MomentAI web API.
 * Contract lives in the MomentAi web repo (docs/mobile-api.md).
 * Mobile shares the HTTPS API only — never source files from src/public.
 */

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://momentai.dev').replace(/\/$/, '');

let accessToken = null;
let progressToken = null;

export function getApiBase() {
  return API_BASE;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function setProgressToken(token) {
  progressToken = token || null;
}

export function getProgressToken() {
  return progressToken;
}

/**
 * @param {string} path
 * @param {RequestInit & { progressAuth?: boolean }} [options]
 */
export async function apiFetch(path, options = {}) {
  const { progressAuth = false, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders || {});

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (progressAuth && progressToken && !headers.has('X-Progress-Token')) {
    headers.set('X-Progress-Token', progressToken);
  }

  if (rest.body && !(rest.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...rest,
    headers,
  });

  return response;
}

export async function getCompatibility() {
  const res = await apiFetch('/api/mobile/compatibility');
  if (!res.ok) {
    return null;
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  return res.json();
}

export async function getMe() {
  const res = await apiFetch('/api/auth/me');
  return res.json();
}

/**
 * Start playlist generation. Expects Phase 0 shape:
 * { success, jobId, progressToken }
 */
export async function processPlaylist(formData) {
  const res = await apiFetch('/api/playlist/process', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to start processing');
  }
  if (data.progressToken) {
    setProgressToken(data.progressToken);
  }
  return data;
}

export async function getJob(jobId) {
  const qs = progressToken ? `?progressToken=${encodeURIComponent(progressToken)}` : '';
  const res = await apiFetch(`/api/playlist/job/${jobId}${qs}`, { progressAuth: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Job status failed (${res.status})`);
  }
  return data;
}

/**
 * Authenticated SSE primary path. Caller should fall back to poll on failure.
 * @param {string} jobId
 * @param {(event: MessageEvent) => void} onMessage
 * @param {(err: Error) => void} onError
 */
export function streamJob(jobId, onMessage, onError) {
  const tokenParam = progressToken
    ? `?progressToken=${encodeURIComponent(progressToken)}`
    : '';
  const url = `${API_BASE}/api/playlist/job/${jobId}/stream${tokenParam}`;

  // EventSource cannot set Authorization headers; Phase 0 progressToken covers resume.
  // When JWT-only ownership is required, prefer fetch+ReadableStream in Phase 3.
  const source = new EventSource(url);

  source.onmessage = onMessage;
  source.onerror = () => {
    source.close();
    onError(new Error('SSE connection failed'));
  };

  return () => source.close();
}

export async function savePlaylist(payload) {
  const res = await apiFetch('/api/playlist/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Save failed');
  }
  return data;
}

export async function suggestMore(payload) {
  const res = await apiFetch('/api/playlist/suggest-more', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Suggest more failed');
  }
  return data;
}

export async function deleteAccount() {
  const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Account deletion failed');
  }
  return data;
}
