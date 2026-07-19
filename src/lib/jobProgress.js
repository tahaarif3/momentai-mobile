/**
 * Phase 3 — Job progress: SSE primary + poll fallback + resume persistence.
 */

import { Preferences } from '@capacitor/preferences';
import { jobStreamUrl, pollJob } from './api.js';
import { track } from './analytics.js';

const ACTIVE_JOB_KEY = 'momentai.activeJob';

export async function persistActiveJob(jobId, progressToken) {
  await Preferences.set({
    key: ACTIVE_JOB_KEY,
    value: JSON.stringify({ jobId, progressToken, savedAt: Date.now() }),
  });
}

export async function clearActiveJob() {
  await Preferences.remove({ key: ACTIVE_JOB_KEY });
}

export async function loadActiveJob() {
  const { value } = await Preferences.get({ key: ACTIVE_JOB_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Primary: EventSource to absolute VITE_API_BASE .../stream?progressToken=
 * Fallback: poll GET .../job/:id with same token
 */
export function watchJob(jobId, progressToken, { onProgress, onComplete, onError } = {}) {
  let settled = false;
  let es = null;
  let pollTimer = null;

  const finish = async (fn, arg) => {
    if (settled) return;
    settled = true;
    try {
      es?.close();
    } catch {
      /* ignore */
    }
    if (pollTimer) clearInterval(pollTimer);
    await clearActiveJob();
    fn?.(arg);
  };

  const startPoll = () => {
    if (pollTimer || settled) return;
    pollTimer = setInterval(async () => {
      try {
        const data = await pollJob(jobId, progressToken);
        if (data.state === 'completed' && data.result) {
          track('generation_complete', { via: 'poll' });
          await finish(onComplete, data.result);
        } else if (data.state === 'failed' && (data.attemptsMade || 0) >= (data.attempts || 3)) {
          await finish(onError, new Error(data.message || 'Generation failed'));
        } else if (data.state === 'active' || data.state === 'waiting' || data.state === 'delayed') {
          onProgress?.({ stage: data.state, message: data.message });
        }
      } catch (err) {
        console.warn('[job] poll error', err.message);
      }
    }, 2500);
  };

  persistActiveJob(jobId, progressToken);

  try {
    es = new EventSource(jobStreamUrl(jobId, progressToken));
    es.addEventListener('progress', (e) => {
      try {
        onProgress?.(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('completed', async (e) => {
      try {
        track('generation_complete', { via: 'sse' });
        await finish(onComplete, JSON.parse(e.data));
      } catch (err) {
        await finish(onError, err);
      }
    });
    es.addEventListener('failed', async (e) => {
      let msg = 'Generation failed';
      try {
        msg = JSON.parse(e.data).message || msg;
      } catch {
        /* ignore */
      }
      await finish(onError, new Error(msg));
    });
    es.onmessage = (e) => {
      // Some proxies emit generic message events
      try {
        const payload = JSON.parse(e.data);
        if (payload.status === 'completed' || payload.result) {
          finish(onComplete, payload.result || payload);
        } else if (payload.status === 'failed') {
          finish(onError, new Error(payload.message || 'Generation failed'));
        } else {
          onProgress?.(payload);
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      console.warn('[job] SSE error — falling back to poll');
      try {
        es.close();
      } catch {
        /* ignore */
      }
      startPoll();
    };
  } catch (err) {
    console.warn('[job] SSE unavailable', err);
    startPoll();
  }

  return {
    cancel: () => finish(() => {}, null),
    resumeWithPoll: startPoll,
  };
}

/** Call on app resume / cold start to recover an in-flight or completed job */
export async function resumeActiveJob({ onProgress, onComplete, onError } = {}) {
  const active = await loadActiveJob();
  if (!active?.jobId) return null;

  try {
    const data = await pollJob(active.jobId, active.progressToken);
    if (data.state === 'completed' && data.result) {
      await clearActiveJob();
      track('generation_complete', { via: 'resume' });
      onComplete?.(data.result);
      return { status: 'completed' };
    }
    if (data.state === 'failed') {
      await clearActiveJob();
      onError?.(new Error(data.message || 'Generation failed'));
      return { status: 'failed' };
    }
    return watchJob(active.jobId, active.progressToken, { onProgress, onComplete, onError });
  } catch (err) {
    onError?.(err);
    return null;
  }
}
