import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { initRouter, showScreen } from './app/router.js';
import { persistActiveJob, restoreActiveJob, state } from './app/state.js';
import {
  apiFetch,
  getCompatibility,
  getProgressToken,
  processPlaylist,
  setProgressToken,
  streamJob,
  getJob,
  savePlaylist,
  suggestMore,
} from './lib/api.js';
import { initAuth, isAuthConfigured, signInWithPassword, signOut } from './lib/auth.js';
import { compressForUpload, photoToFile, pickImage } from './lib/camera.js';
import { purchasePlus, restorePurchases } from './lib/billing.js';
import { renderShareCardPng, sharePngBlob } from './lib/share.js';
import { track } from './lib/analytics.js';

const toastEl = document.getElementById('toast');
const previewEl = document.getElementById('capturePreview');
const hintEl = document.getElementById('viewfinderHint');
const generateBtn = document.getElementById('btnGenerate');
const trackListEl = document.getElementById('trackList');
const playlistTitleEl = document.getElementById('playlistTitle');
const playlistMetaEl = document.getElementById('playlistMeta');
const loadingPctEl = document.getElementById('loadingPct');
const loadingSubEl = document.getElementById('loadingSub');
const authBtn = document.getElementById('btnAuth');
const promptEl = document.getElementById('customPrompt');

function toast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => toastEl.classList.add('hidden'), 2800);
}

async function bootstrapNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#17110c' });
  } catch {
    /* web / unsupported */
  }
}

async function checkCompatibility() {
  const payload = await getCompatibility();
  if (!payload) {
    console.info('[compat] endpoint not available yet — Phase 0 pending');
    return;
  }
  const min = payload.minAppVersion || payload.minIosVersion || payload.minAndroidVersion;
  const current = import.meta.env.VITE_APP_VERSION || '0.1.0';
  if (min && payload.forceUpgrade) {
    toast(payload.message || `Please upgrade MomentAI (min ${min}, have ${current})`);
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => showScreen(el.getAttribute('data-nav')));
  });
}

function bindChips() {
  document.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-chip]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      state.moodChip = chip.getAttribute('data-chip') || '';
      if (promptEl && !promptEl.value.trim()) {
        promptEl.value = state.moodChip;
      }
    });
  });
}

async function stagePhoto(source) {
  try {
    const photo = await pickImage(source);
    state.stagedPhoto = photo;
    const file = await compressForUpload(await photoToFile(photo));
    state.stagedFile = file;

    if (previewEl) {
      previewEl.src = photo.webPath;
      previewEl.classList.remove('hidden');
    }
    hintEl?.classList.add('hidden');
    generateBtn.disabled = false;
    track('camera_ready', { source });
  } catch (err) {
    console.warn(err);
    track('camera_permission_failure', { source });
    toast(err?.message || 'Could not open camera/photos');
  }
}

function renderTracks(tracks) {
  if (!trackListEl) return;
  trackListEl.innerHTML = '';
  for (const track of tracks.slice(0, 24)) {
    const li = document.createElement('li');
    const name = track.name || track.title || 'Track';
    const artist = track.artist || track.artists || '';
    li.innerHTML = `<span>${escapeHtml(name)}</span><span class="muted">${escapeHtml(String(artist))}</span>`;
    trackListEl.appendChild(li);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function applyGenerationResult(result) {
  const tracks = result.tracks || result.playlist?.tracks || [];
  const title = result.aestheticTitle || result.title || result.playlist?.name || 'Your playlist';
  state.generation = {
    title,
    tracks,
    imagePath: result.imagePath || result.imageUrl || null,
    id: result.generationId || result.id || null,
  };
  if (playlistTitleEl) playlistTitleEl.textContent = title;
  if (playlistMetaEl) {
    playlistMetaEl.textContent = `${tracks.length} tracks · ready`;
  }
  renderTracks(tracks);
  showScreen('playlist');
  track('generation_complete', { trackCount: tracks.length });
}

async function pollJobUntilDone(jobId) {
  for (let i = 0; i < 90; i += 1) {
    const data = await getJob(jobId);
    const pct = data.progress ?? data.percent ?? i;
    if (loadingPctEl) loadingPctEl.textContent = `${Math.min(99, Number(pct) || i)}%`;
    if (loadingSubEl && data.message) loadingSubEl.textContent = data.message;

    if (data.status === 'completed' || data.success === true || data.tracks) {
      return data.result || data;
    }
    if (data.status === 'failed' || data.error) {
      throw new Error(data.message || data.error || 'Generation failed');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Timed out waiting for job');
}

async function watchJob(jobId) {
  showScreen('loading');
  if (loadingPctEl) loadingPctEl.textContent = '0%';
  if (loadingSubEl) loadingSubEl.textContent = 'Curating tracks…';

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = async (fn) => {
      if (settled) return;
      settled = true;
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    };

    const stop = streamJob(
      jobId,
      async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const pct = payload.progress ?? payload.percent;
          if (loadingPctEl && pct != null) loadingPctEl.textContent = `${pct}%`;
          if (loadingSubEl && payload.message) loadingSubEl.textContent = payload.message;
          if (payload.status === 'completed' || payload.tracks || payload.result) {
            stop();
            finish(async () => payload.result || payload);
          }
          if (payload.status === 'failed') {
            stop();
            finish(async () => {
              throw new Error(payload.message || 'Generation failed');
            });
          }
        } catch (err) {
          /* ignore non-JSON frames */
        }
      },
      () => {
        finish(() => pollJobUntilDone(jobId));
      },
    );

    // Safety: if SSE never errors but also never completes, poll after 8s in parallel once.
    window.setTimeout(() => {
      if (!settled) {
        stop();
        finish(() => pollJobUntilDone(jobId));
      }
    }, 8000);
  });
}

async function startGeneration() {
  if (!state.stagedFile) {
    toast('Choose a photo first');
    return;
  }

  state.customPrompt = promptEl?.value?.trim() || state.moodChip || '';
  const form = new FormData();
  form.append('image', state.stagedFile);
  if (state.customPrompt) form.append('customPrompt', state.customPrompt);

  showScreen('loading');
  try {
    const started = await processPlaylist(form);
    // Direct sync response (older API) vs job+token (Phase 0)
    if (started.tracks || started.result) {
      applyGenerationResult(started.result || started);
      return;
    }

    const jobId = started.jobId;
    if (!jobId) throw new Error('API did not return jobId');
    state.activeJobId = jobId;
    state.progressToken = started.progressToken || getProgressToken();
    if (state.progressToken) setProgressToken(state.progressToken);
    persistActiveJob();

    const result = await watchJob(jobId);
    state.activeJobId = null;
    persistActiveJob();
    applyGenerationResult(result);
  } catch (err) {
    console.error(err);
    track('upload_failure', { reason: 'process' });
    toast(err?.message || 'Generation failed');
    showScreen('capture');
  }
}

async function resumeJobIfAny() {
  const saved = restoreActiveJob();
  if (!saved?.jobId) return;
  if (saved.progressToken) setProgressToken(saved.progressToken);
  state.activeJobId = saved.jobId;
  state.progressToken = saved.progressToken;
  toast('Resuming generation…');
  try {
    const result = await watchJob(saved.jobId);
    state.activeJobId = null;
    persistActiveJob();
    applyGenerationResult(result);
  } catch (err) {
    toast(err?.message || 'Could not resume job');
    showScreen('home');
  }
}

async function onAuthClick() {
  if (!isAuthConfigured()) {
    toast('Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY');
    return;
  }

  if (state.session) {
    await signOut();
    state.session = null;
    authBtn.textContent = 'Sign in';
    toast('Signed out');
    return;
  }

  const email = window.prompt('Email');
  const password = window.prompt('Password');
  if (!email || !password) return;
  try {
    const data = await signInWithPassword(email, password);
    state.session = data.session;
    authBtn.textContent = 'Sign out';
    toast('Signed in');
  } catch (err) {
    toast(err?.message || 'Sign-in failed');
  }
}

async function onNativeShare() {
  try {
    const blob = await renderShareCardPng({
      title: state.generation.title || 'My soundtrack',
      subtitle: `${state.generation.tracks.length || 0} tracks`,
    });
    const mount = document.getElementById('shareCardMount');
    if (mount) {
      const url = URL.createObjectURL(blob);
      mount.innerHTML = `<img src="${url}" alt="Share card preview" style="width:100%;border-radius:12px" />`;
    }
    if (Capacitor.isNativePlatform()) {
      await sharePngBlob(blob, state.generation.title || 'MomentAI');
    } else {
      toast('Share sheet runs on device; preview rendered');
    }
  } catch (err) {
    toast(err?.message || 'Share failed');
  }
}

async function onSaveSpotify() {
  try {
    const payload = {
      tracks: state.generation.tracks,
      name: state.generation.title || 'MomentAI Playlist',
      generationId: state.generation.id,
    };
    const data = await savePlaylist(payload);
    const url = data.playlistUrl || data.url || data.external_url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    toast('Playlist exported');
  } catch (err) {
    toast(err?.message || 'Save failed — sign in may be required');
  }
}

async function onSuggestMore() {
  try {
    const data = await suggestMore({
      generationId: state.generation.id,
      tracks: state.generation.tracks,
    });
    const extra = data.tracks || data.suggestedTracks || [];
    state.generation.tracks = [...state.generation.tracks, ...extra];
    renderTracks(state.generation.tracks);
    toast(`Added ${extra.length} suggestions`);
  } catch (err) {
    toast(err?.message || 'Suggest more failed');
  }
}

function bindActions() {
  document.getElementById('btnTakePhoto')?.addEventListener('click', () => stagePhoto('camera'));
  document.getElementById('btnPickPhoto')?.addEventListener('click', () => stagePhoto('photos'));
  generateBtn?.addEventListener('click', startGeneration);
  authBtn?.addEventListener('click', onAuthClick);
  document.getElementById('btnNativeShare')?.addEventListener('click', onNativeShare);
  document.getElementById('btnSaveSpotify')?.addEventListener('click', onSaveSpotify);
  document.getElementById('btnSuggestMore')?.addEventListener('click', onSuggestMore);
  document.getElementById('btnPurchase')?.addEventListener('click', async () => {
    try {
      await purchasePlus();
    } catch (err) {
      toast(err?.message || 'Purchase unavailable');
    }
  });
  document.getElementById('btnRestore')?.addEventListener('click', async () => {
    try {
      await restorePurchases();
    } catch (err) {
      toast(err?.message || 'Restore unavailable');
    }
  });
}

async function main() {
  initRouter('home');
  bindNavigation();
  bindChips();
  bindActions();
  await bootstrapNativeChrome();

  const auth = await initAuth();
  state.authConfigured = auth.configured;
  state.session = auth.session;
  if (auth.session) authBtn.textContent = 'Sign out';

  await checkCompatibility();
  await resumeJobIfAny();

  // Warm the API base (also validates CORS for Capacitor origins once Phase 0 ships).
  apiFetch('/api/auth/me').catch(() => {});
  track('app_open');
}

main().catch((err) => {
  console.error(err);
  toast('Failed to start app');
});
