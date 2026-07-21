import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Browser } from '@capacitor/browser';
import { initRouter, showScreen, registerScreen } from './app/router.js';
import {
  processImage,
  fetchHistory,
  fetchGeneration,
  savePlaylist,
  suggestMore,
  regenerate,
  deleteAccount,
  fetchCompatibility,
} from './lib/api.js';
import {
  initAuth,
  signInWithPassword,
  signUp,
  signOut,
  resetPassword,
  isAuthConfigured,
} from './lib/auth.js';
import { captureMoment, fileFromInput } from './lib/camera.js';
import { watchJob, resumeActiveJob } from './lib/jobProgress.js';
import { sharePlaylistCard, rasterizeShareCard } from './lib/share.js';
import {
  initBilling,
  purchasePremium,
  restorePurchases,
  shouldShowStripeCheckout,
  isNativeBilling,
} from './lib/billing.js';
import { initObservability, track, captureError, platformName } from './lib/analytics.js';
import {
  setOutputFeatures,
  isAppleMusicEnabled,
  shareOpenAnywhere,
  saveToAppleMusic,
  publicPlaylistUrl,
} from './lib/outputs.js';

const state = {
  user: null,
  stagedFile: null,
  generation: null,
  authMode: 'signin',
  moodChip: '',
};

const $ = (id) => document.getElementById(id);

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.add('hidden'), 2800);
}

function setLoader(pct, message) {
  const bar = $('loaderBar');
  const msg = $('loadingSub');
  const pctEl = $('loadingPct');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (msg && message) msg.textContent = message;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
}

function openAuthModal() {
  $('authModal')?.classList.remove('hidden');
}

function closeAuthModal() {
  $('authModal')?.classList.add('hidden');
}

function syncAuthUi() {
  const signin = state.authMode === 'signin';
  if ($('authTitle')) $('authTitle').textContent = signin ? 'Sign in' : 'Sign up';
  if ($('btnAuthSubmit')) $('btnAuthSubmit').textContent = signin ? 'Sign in' : 'Create account';
  if ($('btnAuthToggle')) {
    $('btnAuthToggle').textContent = signin ? 'Create account' : 'Have an account? Sign in';
  }
}

function renderAccount() {
  const el = $('accountSummary');
  const counter = $('momentsCounter');
  const authBtn = $('btnAuth');
  const accountAuth = $('btnAccountAuth');
  if (!state.user) {
    if (el) el.textContent = 'Not signed in';
    if (counter) counter.textContent = 'Free moments · sign in to track usage';
    if (authBtn) authBtn.textContent = 'Sign in';
    if (accountAuth) accountAuth.textContent = 'Sign in';
    return;
  }
  const rem = state.user.momentsRemainingToday;
  const limit = state.user.dailyUploadLimit;
  if (el) {
    el.textContent =
      `${state.user.email || state.user.displayName} · ${state.user.tier}` +
      (limit != null ? ` · ${rem}/${limit} moments today` : ' · unlimited');
  }
  if (counter) {
    counter.textContent =
      state.user.tier === 'premium'
        ? 'Unlimited moments (Plus)'
        : `${rem ?? '—'} free moments left today`;
  }
  if (authBtn) authBtn.textContent = 'Account';
  if (accountAuth) accountAuth.textContent = 'Signed in';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshHistory() {
  const grid = $('momentsGrid');
  if (!grid) return;
  if (!state.user) {
    grid.innerHTML = '<p class="muted empty-state">Sign in to see saved moments.</p>';
    if ($('momentsCount')) $('momentsCount').textContent = '0 saved';
    return;
  }
  try {
    const data = await fetchHistory();
    const rows = data.history || [];
    if ($('momentsCount')) $('momentsCount').textContent = `${rows.length} saved`;
    if (state.user) {
      state.user.momentsRemainingToday = data.remainingToday;
      state.user.dailyUploadLimit = data.dailyUploadLimit;
      renderAccount();
    }
    if (!rows.length) {
      grid.innerHTML = '<p class="muted empty-state">No moments yet — capture one.</p>';
      return;
    }
    grid.innerHTML = rows
      .map((m) => {
        const thumb = (m.display_image || m.image_thumb || '').replace(/'/g, '%27');
        return `<button type="button" class="moment-card" data-id="${m.id}">
          <div class="moment-thumb" style="background-image:url('${thumb}')"></div>
          <div class="moment-meta">${escapeHtml(m.emotional_vibe || m.playlist_name || 'Moment')}</div>
        </button>`;
      })
      .join('');
    grid.querySelectorAll('.moment-card').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const full = await fetchGeneration(btn.dataset.id);
          applyGeneration(full);
          showScreen('playlist');
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p class="muted empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function applyGeneration(result) {
  const tracks = result.tracks || result.playlist?.tracks || [];
  state.generation = {
    id: result.generationId || result.id || null,
    shareUrl:
      result.shareUrl ||
      (result.generationId || result.id
        ? publicPlaylistUrl(result.generationId || result.id)
        : null),
    imagePath: result.imagePath || result.imageUrl || null,
    metadata: result.metadata || {},
    tracks,
    suggestedTracks: result.suggestedTracks || [],
  };
  const title =
    result.metadata?.emotionalVibe ||
    result.aestheticTitle ||
    result.title ||
    'Your playlist';
  if ($('playlistTitle')) $('playlistTitle').textContent = title;
  if ($('playlistMood')) {
    $('playlistMood').textContent = result.metadata?.environmentalContext || 'YOUR MOMENT';
  }
  if ($('playlistMeta')) $('playlistMeta').textContent = `${tracks.length} tracks · ready`;
  syncOutputButtons();
  renderTracks();
}

function syncOutputButtons() {
  const appleBtn = $('btnSaveAppleMusic');
  const outputsRow = document.querySelector('.btn-row--outputs');
  const hint = $('appleMusicHint');
  const enabled = isAppleMusicEnabled();
  if (appleBtn) {
    appleBtn.classList.toggle('hidden', !enabled);
  }
  if (outputsRow) {
    outputsRow.classList.toggle('btn-row--single', !enabled);
  }
  if (hint) {
    if (enabled && Capacitor.getPlatform() === 'android') {
      hint.hidden = false;
      hint.textContent = 'Apple Music on Android opens catalog links for now.';
    } else {
      hint.hidden = true;
    }
  }
}

function renderTracks() {
  const tracks = state.generation?.tracks || [];
  const list = $('trackList');
  if (!list) return;
  list.innerHTML = tracks
    .map((t, i) => {
      const artist = t.artists?.[0]?.name || t.artist || '';
      return `<li data-i="${i}">
        <span>${escapeHtml(t.name || t.title || 'Track')}</span>
        <button type="button" class="btn btn-ghost btn-mini" data-preview="${i}">▶</button>
        <span class="muted">${escapeHtml(String(artist))}</span>
      </li>`;
    })
    .join('');
  list.querySelectorAll('[data-preview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = tracks[Number(btn.dataset.preview)];
      const audio = $('previewAudio');
      if (t?.preview_url && audio) {
        audio.src = t.preview_url;
        audio.play().catch(() => {});
      } else if (t?.external_urls?.spotify) {
        Browser.open({ url: t.external_urls.spotify });
      }
    });
  });
}

async function beginWithFile(file) {
  state.stagedFile = file;
  const url = URL.createObjectURL(file);
  const preview = $('capturePreview');
  if (preview) {
    preview.src = url;
    preview.classList.remove('hidden');
  }
  $('viewfinderHint')?.classList.add('hidden');
  if ($('btnGenerate')) $('btnGenerate').disabled = false;
  if ($('permissionHint')) $('permissionHint').textContent = '';
}

async function stageFromNative(source) {
  try {
    const file = await captureMoment({ source });
    await beginWithFile(file);
  } catch (err) {
    if (err.message === 'WEB_FILE_PICKER' || !Capacitor.isNativePlatform()) {
      $('fileInput')?.click();
      return;
    }
    if ($('permissionHint')) $('permissionHint').textContent = err.message || '';
    toast(err.message || 'Camera unavailable');
    track('camera_permission_failure', { source });
  }
}

function attachJobWatchers(jobId, progressToken) {
  return watchJob(jobId, progressToken, {
    onProgress: (p) => {
      if (p.stage === 'analyzing') setLoader(25, 'Reading the light…');
      else if (p.stage === 'resolving') setLoader(60, 'Matching the mood…');
      else if (p.stage === 'finalizing') setLoader(90, 'Curating tracks…');
      else if (p.message) setLoader(40, p.message);
    },
    onComplete: (result) => {
      applyGeneration(result);
      showScreen('playlist');
      refreshHistory();
    },
    onError: (err) => {
      track('upload_failure', { reason: 'job' });
      captureError(err);
      toast(err.message || 'Generation failed');
      showScreen('capture');
    },
  });
}

async function runGeneration() {
  if (!state.stagedFile) {
    toast('Choose a photo first');
    return;
  }
  const prompt = ($('customPrompt')?.value || state.moodChip || '').trim();
  showScreen('loading');
  setLoader(8, 'Uploading…');
  try {
    const data = await processImage(state.stagedFile, prompt);
    if (data.jobId) {
      setLoader(15, 'Reading the light…');
      attachJobWatchers(data.jobId, data.progressToken);
    } else {
      applyGeneration(data.result || data);
      showScreen('playlist');
      refreshHistory();
    }
  } catch (err) {
    track('upload_failure', { reason: err.code || 'http' });
    captureError(err);
    if (err.code === 'DAILY_LIMIT') showScreen('paywall');
    else {
      toast(err.message || 'Generation failed');
      showScreen('capture');
    }
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-nav');
      if (target === 'share' && state.generation) {
        showScreen('share');
        maybePreviewShare();
        return;
      }
      showScreen(target);
    });
  });
}

async function renderSharePreview() {
  if (!state.generation || !$('shareCardMount')) return;
  const dataUrl = await rasterizeShareCard({
    title: state.generation.metadata?.emotionalVibe || 'Your moment',
    moodLine: state.generation.metadata?.environmentalContext || '',
    imageUrl: state.generation.imagePath,
    playlistMeta: 'momentai.dev',
  });
  $('shareCardMount').innerHTML =
    `<img src="${dataUrl}" alt="Share card preview" style="width:100%;border-radius:12px" />`;
}

async function maybePreviewShare() {
  if (!state.generation) return;
  try {
    await renderSharePreview();
  } catch (err) {
    toast(err.message || 'Share preview failed — check Spaces CORS for remote images.');
  }
}

async function doNativeShare() {
  if (!state.generation) return;
  try {
    await renderSharePreview();
    await sharePlaylistCard({
      title: state.generation.metadata?.emotionalVibe || 'Your moment',
      moodLine: state.generation.metadata?.environmentalContext || '',
      imageUrl: state.generation.imagePath,
      playlistMeta: 'momentai.dev',
    });
  } catch (err) {
    toast(err.message || 'Share failed — check Spaces CORS for remote images.');
  }
}

function bindActions() {
  $('btnAuth')?.addEventListener('click', () => {
    if (state.user) showScreen('account');
    else openAuthModal();
  });
  $('btnAccountAuth')?.addEventListener('click', () => {
    if (!state.user) openAuthModal();
  });
  $('btnAuthClose')?.addEventListener('click', closeAuthModal);
  $('btnAuthToggle')?.addEventListener('click', () => {
    state.authMode = state.authMode === 'signin' ? 'signup' : 'signin';
    syncAuthUi();
  });
  $('btnAuthSubmit')?.addEventListener('click', async () => {
    const email = $('authEmail')?.value.trim();
    const password = $('authPassword')?.value;
    if (!email || !password) return toast('Enter email and password');
    try {
      if (state.authMode === 'signin') await signInWithPassword(email, password);
      else {
        const data = await signUp(email, password);
        if (!data.session) toast('Check your email to confirm, then sign in.');
      }
      closeAuthModal();
    } catch (err) {
      toast(err.message || 'Auth failed');
    }
  });
  $('btnAuthReset')?.addEventListener('click', async () => {
    const email = $('authEmail')?.value.trim();
    if (!email) return toast('Enter your email first');
    try {
      await resetPassword(email);
      toast('Password reset email sent');
    } catch (err) {
      toast(err.message || 'Reset failed');
    }
  });
  $('btnSignOut')?.addEventListener('click', async () => {
    await signOut();
    state.user = null;
    renderAccount();
    refreshHistory();
    toast('Signed out');
    showScreen('home');
  });
  $('btnDeleteAccount')?.addEventListener('click', async () => {
    if (!state.user) {
      openAuthModal();
      return;
    }
    const password = $('deletePassword')?.value || '';
    if (!password) {
      toast('Enter your password to confirm deletion');
      return;
    }
    if (!confirm('Permanently delete your MomentAI account and history? This cannot be undone.')) {
      return;
    }
    try {
      // Re-auth before destructive delete (store / compliance expectation)
      const email = state.user.email;
      if (!email) throw new Error('Account email missing — sign in again');
      await signInWithPassword(email, password);
      await deleteAccount();
      track('account_deleted', { ok: true });
      await signOut();
      state.user = null;
      if ($('deletePassword')) $('deletePassword').value = '';
      renderAccount();
      refreshHistory();
      toast('Account deleted');
      showScreen('home');
    } catch (err) {
      captureError(err);
      toast(err.message || 'Delete failed');
    }
  });

  $('btnTakePhoto')?.addEventListener('click', () => stageFromNative('camera'));
  $('btnPickPhoto')?.addEventListener('click', () => stageFromNative('photos'));
  $('fileInput')?.addEventListener('change', async (e) => {
    const raw = e.target.files?.[0];
    if (!raw) return;
    try {
      await beginWithFile(await fileFromInput(raw));
    } catch (err) {
      toast(err.message);
    }
  });
  $('btnGenerate')?.addEventListener('click', runGeneration);

  document.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-chip]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      state.moodChip = chip.getAttribute('data-chip') || '';
      if ($('customPrompt') && !$('customPrompt').value.trim()) {
        $('customPrompt').value = state.moodChip;
      }
    });
  });

  $('btnSaveSpotify')?.addEventListener('click', async () => {
    if (!state.generation?.tracks?.length) return;
    if (!state.user) {
      openAuthModal();
      return;
    }
    try {
      const name = state.generation.metadata?.emotionalVibe || 'MomentAI Playlist';
      const uris = state.generation.tracks.map((t) => t.uri).filter(Boolean);
      const data = await savePlaylist({
        playlistName: name,
        playlistDescription: state.generation.metadata?.environmentalContext || '',
        trackUris: uris,
        generationId: state.generation.id,
      });
      const url = data.playlistUrl || data.url || data.external_url;
      if (url) await Browser.open({ url });
      track('playlist_save', {
        target: 'spotify',
        playlist_id: state.generation.id || 'unknown',
        track_count: uris.length,
      });
      toast('Playlist exported');
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  });

  $('btnOpenAnywhere')?.addEventListener('click', async () => {
    if (!state.generation?.id && !state.generation?.shareUrl) {
      toast('Generate a playlist first');
      return;
    }
    try {
      const result = await shareOpenAnywhere({
        generationId: state.generation.id,
        shareUrl: state.generation.shareUrl || publicPlaylistUrl(state.generation.id),
        title: state.generation.metadata?.emotionalVibe || 'MomentAI playlist',
      });
      if (result.via === 'clipboard') toast('Link copied — open anywhere');
      else if (result.via === 'cancelled') return;
      else if (result.via === 'browser') toast('Opened share page');
      else toast('Share sheet ready');
    } catch (err) {
      captureError(err);
      toast(err.message || 'Share failed');
    }
  });

  $('btnSaveAppleMusic')?.addEventListener('click', async () => {
    if (!state.generation?.tracks?.length) return;
    if (!isAppleMusicEnabled()) {
      toast('Apple Music save is not enabled yet');
      return;
    }
    try {
      const result = await saveToAppleMusic({
        generationId: state.generation.id,
        name: state.generation.metadata?.emotionalVibe || 'MomentAI Playlist',
        description: state.generation.metadata?.environmentalContext || '',
        tracks: state.generation.tracks,
      });
      if (result.mode === 'deep_link_fallback' || result.mode === 'web_preview') {
        toast(`Opened Apple Music · ${result.matchedCount} of ${result.trackCount} matched`);
      } else {
        toast(`Saved ${result.matchedCount} of ${result.trackCount} tracks to Apple Music`);
      }
    } catch (err) {
      captureError(err);
      toast(err.message || 'Apple Music save failed');
    }
  });

  $('btnShare')?.addEventListener('click', async () => {
    showScreen('share');
    await maybePreviewShare();
  });
  $('btnNativeShare')?.addEventListener('click', () => doNativeShare());

  $('btnSuggestMore')?.addEventListener('click', async () => {
    if (!state.generation) return;
    try {
      const excludeTrackIds = state.generation.tracks.map((t) => t.id).filter(Boolean);
      const data = await suggestMore({
        metadata: state.generation.metadata,
        excludeTrackIds,
        customPrompt: $('customPrompt')?.value || '',
      });
      state.generation.tracks = [...state.generation.tracks, ...(data.tracks || [])].slice(0, 30);
      renderTracks();
      toast(`Added ${(data.tracks || []).length} suggestions`);
    } catch (err) {
      toast(err.message);
    }
  });

  $('btnRegenerate')?.addEventListener('click', async () => {
    if (!state.generation?.id) return;
    if (state.user?.tier !== 'premium') {
      showScreen('paywall');
      return;
    }
    showScreen('loading');
    setLoader(10, 'Reading the light…');
    try {
      const data = await regenerate(state.generation.id);
      if (data.jobId) attachJobWatchers(data.jobId, data.progressToken);
      else {
        applyGeneration(data);
        showScreen('playlist');
      }
    } catch (err) {
      if (err.code === 'PLUS_REQUIRED') showScreen('paywall');
      else toast(err.message);
    }
  });

  $('btnPurchase')?.addEventListener('click', async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // Browser-only: send people to the website for Stripe
        await Browser.open({ url: 'https://momentai.dev' });
        return;
      }
      const { active } = await purchasePremium();
      toast(active ? 'Premium unlocked' : 'Purchase finished — entitlement syncing…');
      if (active && state.user) state.user.tier = 'premium';
      renderAccount();
    } catch (err) {
      captureError(err);
      toast(err.message || 'Purchase unavailable');
    }
  });
  $('btnRestore')?.addEventListener('click', async () => {
    try {
      const { active } = await restorePurchases();
      toast(active ? 'Purchases restored' : 'No active subscription found');
      if (active && state.user) state.user.tier = 'premium';
      renderAccount();
    } catch (err) {
      captureError(err);
      toast(err.message || 'Restore unavailable');
    }
  });

  if (shouldShowStripeCheckout()) {
    $('btnWebCheckout')?.classList.remove('hidden');
  }

  registerScreen('home', { onShow: () => refreshHistory() });
}

async function boot() {
  initObservability();
  track('app_open');
  initRouter('home');
  bindNavigation();
  bindActions();
  syncAuthUi();

  try {
    const compat = await fetchCompatibility();
    if (compat.features) setOutputFeatures(compat.features);
    syncOutputButtons();
    if (compat.forceUpgrade) {
      toast(compat.forceUpgradeMessage || 'Please update MomentAI.');
    }
  } catch {
    console.info('[compat] check skipped');
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#17110c' });
    } catch {
      /* ignore */
    }
  }

  await initAuth({
    onSession: async (user) => {
      state.user = user;
      renderAccount();
      refreshHistory();
      if (user?.id) await initBilling(user.id);
    },
  });

  if (!isAuthConfigured()) {
    console.warn('Auth not configured — set env or ensure /api/auth/config is reachable');
  }

  if ($('paywallNote')) {
    $('paywallNote').textContent = isNativeBilling()
      ? `Store billing on ${platformName()}. Stripe checkout is web-only.`
      : 'Browser preview — native builds use App Store / Play (RevenueCat).';
  }

  await resumeActiveJob({
    onComplete: (result) => {
      applyGeneration(result);
      showScreen('playlist');
      toast('Resumed completed generation');
    },
    onProgress: (p) => {
      showScreen('loading');
      if (p?.message) setLoader(40, p.message);
    },
    onError: (err) => console.warn('resume job', err.message),
  });

  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    resumeActiveJob({
      onComplete: (result) => {
        applyGeneration(result);
        showScreen('playlist');
      },
      onError: (err) => console.warn('resume job', err.message),
    });
  });
}

boot().catch((err) => {
  captureError(err);
  toast('Failed to start app');
});
