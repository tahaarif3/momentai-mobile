import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Browser } from '@capacitor/browser';
import {
  initRouter,
  showScreen,
  registerScreen,
  goBackToTab,
} from './app/router.js';
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
import { sharePlaylistCard, rasterizeShareCard, buildShareCardDom } from './lib/share.js';
import {
  initBilling,
  purchasePremium,
  restorePurchases,
  shouldShowStripeCheckout,
  isNativeBilling,
  getOfferings,
} from './lib/billing.js';
import { initObservability, track, captureError, platformName } from './lib/analytics.js';

const LOADING_PHASES = ['Reading the light…', 'Matching the mood…', 'Curating tracks…'];

const state = {
  user: null,
  stagedFile: null,
  generation: null,
  authMode: 'signin',
  moodChip: 'Golden hour',
  historyRows: [],
  momentFilter: 'all',
  shareDataUrl: null,
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

function setLoader(pct, phaseIdx) {
  const phase = LOADING_PHASES[phaseIdx] ?? LOADING_PHASES[0];
  const pctEl = $('loadingPct');
  const phaseEl = $('loadingPhase');
  const sub = $('loadingSub');
  if (phaseEl) phaseEl.textContent = phase;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}% · matching to spotify`;
  if (sub) sub.textContent = pct >= 66 ? 'Curating tracks…' : 'Curating tracks…';
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

function userDisplayName() {
  if (!state.user) return 'there';
  return state.user.displayName || state.user.email?.split('@')[0] || 'there';
}

function userInitial() {
  const n = userDisplayName();
  return n.charAt(0).toUpperCase();
}

function formatGoldenHourLeft() {
  const now = new Date();
  const sunset = new Date(now);
  sunset.setHours(20, 0, 0, 0);
  if (now > sunset) sunset.setDate(sunset.getDate() + 1);
  const diff = Math.max(0, sunset - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} LEFT`;
}

function renderMomentsCounter() {
  const el = $('momentsCounter');
  if (!el) return;
  if (!state.user) {
    el.innerHTML = 'Free moments · <button type="button" class="accent-link" data-nav="profile">sign in ›</button>';
    el.querySelector('[data-nav]')?.addEventListener('click', () => showScreen('profile'));
    return;
  }
  if (state.user.tier === 'premium') {
    el.innerHTML =
      'Unlimited moments · <button type="button" class="accent-link" data-nav="paywall">manage ›</button>';
  } else {
    const rem = state.user.momentsRemainingToday ?? '—';
    const limit = state.user.dailyUploadLimit ?? 3;
    el.innerHTML = `${rem} of ${limit} free moments left today · <button type="button" class="accent-link" data-nav="paywall">go unlimited ›</button>`;
  }
  el.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });
}

function renderProfile() {
  const name = state.user ? userDisplayName() : 'Guest';
  if ($('profileName')) $('profileName').textContent = name;
  if ($('profileAvatar')) $('profileAvatar').textContent = userInitial();
  if ($('profileHandle')) {
    $('profileHandle').textContent = state.user
      ? `@${state.user.email?.split('@')[0] || 'user'} · ${state.user.tier || 'free'}`
      : '@guest · sign in';
  }
  if ($('settingsAuth')) {
    $('settingsAuth').textContent = state.user ? 'Signed in' : 'Sign in';
  }
  if ($('settingsTier')) {
    $('settingsTier').textContent =
      state.user?.tier === 'premium' ? 'Plus' : 'Free';
  }
  if ($('heroHeadline')) {
    $('heroHeadline').textContent = `Catch the light, ${name}.`;
  }
  if ($('goldenHourLabel')) {
    $('goldenHourLabel').textContent = `GOLDEN HOUR · ${formatGoldenHourLeft()}`;
  }
  if ($('deletePanel')) {
    $('deletePanel').classList.toggle('hidden', !state.user);
  }
  renderMomentsCounter();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function momentTileHtml(m, thumbH = 118) {
  const thumb = (m.display_image || m.image_thumb || '').replace(/'/g, '%27');
  const title = escapeHtml(m.emotional_vibe || m.playlist_name || 'Moment');
  const meta = escapeHtml(`${m.track_count || '—'} tracks · ${m.created_at?.slice(0, 10) || 'recent'}`);
  return `<button type="button" class="moment-tile" data-id="${m.id}">
    <div class="moment-tile-thumb" style="height:${thumbH}px;background-image:url('${thumb}')"></div>
    <div class="moment-tile-body">
      <div class="moment-tile-title">${title}</div>
      <div class="moment-tile-meta">${meta}</div>
    </div>
  </button>`;
}

function bindMomentTiles(container) {
  container?.querySelectorAll('.moment-tile').forEach((btn) => {
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
}

function filterMoments(rows) {
  if (state.momentFilter === 'all') return rows;
  if (state.momentFilter === 'month') {
    const now = new Date();
    return rows.filter((m) => {
      const d = new Date(m.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }
  if (state.momentFilter === 'golden') {
    return rows.filter((m) =>
      /golden|sunset|warm|hour/i.test(m.emotional_vibe || m.playlist_name || ''),
    );
  }
  if (state.momentFilter === 'night') {
    return rows.filter((m) =>
      /night|dark|midnight|drive/i.test(m.emotional_vibe || m.playlist_name || ''),
    );
  }
  return rows;
}

function renderMomentsGrids(rows) {
  const filtered = filterMoments(rows);
  const totalTracks = filtered.reduce((n, m) => n + (m.track_count || 0), 0);

  if ($('momentsPageMeta')) {
    $('momentsPageMeta').textContent = `${filtered.length} moments · ${totalTracks} tracks`;
  }
  if ($('statMoments')) $('statMoments').textContent = String(rows.length);
  if ($('statTracks')) $('statTracks').textContent = String(totalTracks);

  const homeGrid = $('homeMomentsGrid');
  if (homeGrid) {
    if (!rows.length) {
      homeGrid.innerHTML =
        '<p class="muted empty-state">No moments yet — capture one.</p>';
    } else {
      homeGrid.innerHTML = rows.slice(0, 2).map((m) => momentTileHtml(m)).join('');
      bindMomentTiles(homeGrid);
    }
  }

  const grid = $('momentsGrid');
  if (grid) {
    if (!filtered.length) {
      grid.innerHTML = '<p class="muted empty-state">No moments match this filter.</p>';
    } else {
      grid.innerHTML = filtered.map((m) => momentTileHtml(m, 126)).join('');
      bindMomentTiles(grid);
    }
  }
}

function renderDiscover() {
  const list = $('discoverList');
  const meta = $('discoverMeta');
  if (meta) meta.textContent = 'Coming in a later update';
  if (list) {
    list.innerHTML =
      '<p class="muted empty-state">Shared playlists from friends will appear here. Capture and share your own moments today.</p>';
  }
  if ($('friendsScroll')) {
    $('friendsScroll').innerHTML =
      '<p class="muted empty-state empty-state--inline">Friend sharing comes in a later update.</p>';
  }
}

async function openManageSubscriptions() {
  const url = Capacitor.getPlatform() === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
  try {
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function syncPaywallPricing() {
  try {
    const offerings = await getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    const product = pkg?.product;
    if (product?.priceString && $('planPrice')) {
      const period = /year|annual/i.test(product.subscriptionPeriod || '')
        ? '/ year'
        : '/ month';
      $('planPrice').innerHTML = `${product.priceString} <span>${period}</span>`;
    }
  } catch {
    /* keep static fallback until RevenueCat keys are set */
  }
}

async function refreshHistory() {
  if (!state.user) {
    state.historyRows = [];
    renderMomentsGrids([]);
    renderDiscover();
    renderProfile();
    return;
  }
  try {
    const data = await fetchHistory();
    const rows = data.history || [];
    state.historyRows = rows;
    if (state.user) {
      state.user.momentsRemainingToday = data.remainingToday;
      state.user.dailyUploadLimit = data.dailyUploadLimit;
    }
    renderMomentsGrids(rows);
    renderDiscover();
    renderProfile();
  } catch (err) {
    const homeGrid = $('homeMomentsGrid');
    if (homeGrid) {
      homeGrid.innerHTML = `<p class="muted empty-state">${escapeHtml(err.message)}</p>`;
    }
  }
}

function applyGeneration(result) {
  const tracks = result.tracks || result.playlist?.tracks || [];
  state.generation = {
    id: result.generationId || result.id || null,
    imagePath: result.imagePath || result.imageUrl || result.display_image || null,
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
  const bpm = result.metadata?.bpm || result.metadata?.tempo;
  const dur = tracks.length ? `${tracks.length} tracks` : '—';
  if ($('playlistMeta')) {
    $('playlistMeta').textContent = [
      state.moodChip?.toLowerCase() || 'mood',
      bpm ? `${bpm} bpm` : null,
      dur,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const cover = $('playlistCover');
  if (cover && state.generation.imagePath) {
    cover.style.backgroundImage = `url('${state.generation.imagePath.replace(/'/g, '%27')}')`;
  }
  renderTracks();
}

function renderTracks() {
  const tracks = state.generation?.tracks || [];
  const list = $('trackList');
  if (!list) return;
  list.innerHTML = tracks
    .map((t, i) => {
      const artist = t.artists?.[0]?.name || t.artist || '';
      const match = t.match_score ?? t.matchScore ?? Math.floor(70 + Math.random() * 25);
      const dur = t.duration_ms
        ? `${Math.floor(t.duration_ms / 60000)}:${String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0')}`
        : '—';
      return `<li class="track-row" data-i="${i}">
        <span class="track-index">${String(i + 1).padStart(2, '0')}</span>
        <div class="track-art"></div>
        <div>
          <div class="track-name">${escapeHtml(t.name || t.title || 'Track')}</div>
          <div class="track-artist">${escapeHtml(String(artist))}</div>
        </div>
        <span class="track-match">${match}%</span>
        <span class="track-dur">${dur}</span>
      </li>`;
    })
    .join('');
  list.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', () => {
      const t = tracks[Number(row.dataset.i)];
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
  if ($('permissionHint')) $('permissionHint').textContent = '';

  const pickerGrid = $('pickerGrid');
  if (pickerGrid) {
    pickerGrid.innerHTML = `<button type="button" class="picker-tile" id="btnPickPhoto">
      <img src="${url}" alt="Selected" />
    </button>`;
    $('btnPickPhoto')?.addEventListener('click', () => showScreen('picker'));
  }
}

async function stageFromNative(source) {
  try {
    const file = await captureMoment({ source });
    await beginWithFile(file);
    if (source === 'photos') showScreen('capture');
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
      const pct = p.percent ?? (p.stage === 'analyzing' ? 25 : p.stage === 'resolving' ? 60 : 90);
      const phaseIdx =
        p.stage === 'analyzing' ? 0 : p.stage === 'resolving' ? 1 : p.stage === 'finalizing' ? 2 : 0;
      setLoader(pct, phaseIdx);
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
  setLoader(8, 0);
  try {
    const data = await processImage(state.stagedFile, prompt);
    if (data.jobId) {
      setLoader(15, 0);
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

  document.querySelectorAll('[data-action="back-tab"]').forEach((el) => {
    el.addEventListener('click', () => goBackToTab());
  });
}

async function renderSharePreview() {
  if (!state.generation || !$('shareCardMount')) return;
  const opts = {
    title: state.generation.metadata?.emotionalVibe || 'Your moment',
    moodLine: state.generation.metadata?.environmentalContext || state.moodChip || '',
    imageUrl: state.generation.imagePath,
    playlistMeta: 'momentai.app',
    dateLabel: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
  $('shareCardMount').innerHTML = buildShareCardDom(opts);
  state.shareDataUrl = await rasterizeShareCard(opts);
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
    await sharePlaylistCard({
      title: state.generation.metadata?.emotionalVibe || 'Your moment',
      moodLine: state.generation.metadata?.environmentalContext || '',
      imageUrl: state.generation.imagePath,
      playlistMeta: 'momentai.app',
      dateLabel: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  } catch (err) {
    toast(err.message || 'Share failed — check Spaces CORS for remote images.');
  }
}

function bindActions() {
  $('btnProfileAuth')?.addEventListener('click', () => {
    if (!state.user) openAuthModal();
    else toast('Signed in as ' + (state.user.email || 'user'));
  });
  $('btnManageSub')?.addEventListener('click', () => openManageSubscriptions());
  $('btnManageSubInline')?.addEventListener('click', () => openManageSubscriptions());
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
    renderProfile();
    refreshHistory();
    toast('Signed out');
    showScreen('profile');
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
      const email = state.user.email;
      if (!email) throw new Error('Account email missing — sign in again');
      await signInWithPassword(email, password);
      await deleteAccount();
      track('account_deleted', { ok: true });
      await signOut();
      state.user = null;
      if ($('deletePassword')) $('deletePassword').value = '';
      renderProfile();
      refreshHistory();
      toast('Account deleted');
      showScreen('profile');
    } catch (err) {
      captureError(err);
      toast(err.message || 'Delete failed');
    }
  });

  $('btnOpenPicker')?.addEventListener('click', () => showScreen('picker'));
  $('btnPickPhoto')?.addEventListener('click', () => stageFromNative('photos'));
  $('btnShutter')?.addEventListener('click', async () => {
    if (state.stagedFile) {
      await runGeneration();
      return;
    }
    try {
      await stageFromNative('camera');
      if (state.stagedFile) await runGeneration();
    } catch (err) {
      toast(err.message || 'Capture failed');
    }
  });
  $('fileInput')?.addEventListener('change', async (e) => {
    const raw = e.target.files?.[0];
    if (!raw) return;
    try {
      await beginWithFile(await fileFromInput(raw));
      showScreen('capture');
    } catch (err) {
      toast(err.message);
    }
  });

  document.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-chip]').forEach((c) => {
        c.classList.remove('mood-chip--active');
      });
      chip.classList.add('mood-chip--active');
      state.moodChip = chip.getAttribute('data-chip') || '';
      if ($('customPrompt')) $('customPrompt').value = state.moodChip;
    });
  });

  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((c) => {
        c.classList.remove('chip--active');
      });
      chip.classList.add('chip--active');
      state.momentFilter = chip.dataset.filter || 'all';
      renderMomentsGrids(state.historyRows);
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
      toast('Playlist exported');
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  });

  $('btnShare')?.addEventListener('click', async () => {
    showScreen('share');
    await maybePreviewShare();
  });
  $('btnNativeShare')?.addEventListener('click', () => doNativeShare());
  $('btnDownloadShare')?.addEventListener('click', async () => {
    try {
      await maybePreviewShare();
      if (!state.shareDataUrl) return;
      const a = document.createElement('a');
      a.href = state.shareDataUrl;
      a.download = 'momentai-share.png';
      a.click();
    } catch (err) {
      toast(err.message);
    }
  });
  $('btnCopyLink')?.addEventListener('click', () => {
    const link = state.generation?.id
      ? `https://momentai.dev/m/${state.generation.id}`
      : 'https://momentai.dev';
    navigator.clipboard?.writeText(link).then(
      () => toast('Link copied'),
      () => toast(link),
    );
  });

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
    setLoader(10, 0);
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
        await Browser.open({ url: 'https://momentai.dev' });
        return;
      }
      const { active } = await purchasePremium();
      toast(active ? 'Premium unlocked' : 'Purchase finished — entitlement syncing…');
      if (active && state.user) state.user.tier = 'premium';
      renderProfile();
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
      renderProfile();
    } catch (err) {
      captureError(err);
      toast(err.message || 'Restore unavailable');
    }
  });

  if (shouldShowStripeCheckout()) {
    $('btnWebCheckout')?.classList.remove('hidden');
  }

  registerScreen('home', { onEnter: () => refreshHistory() });
  registerScreen('moments', { onEnter: () => refreshHistory() });
  registerScreen('profile', { onEnter: () => renderProfile() });
  registerScreen('paywall', { onEnter: () => syncPaywallPricing() });
  registerScreen('capture', {
    onEnter: () => {
      if (!state.stagedFile) {
        $('capturePreview')?.classList.add('hidden');
        $('viewfinderHint')?.classList.remove('hidden');
      }
    },
  });
}

async function boot() {
  initObservability();
  track('app_open');
  initRouter('home');
  bindNavigation();
  bindActions();
  syncAuthUi();
  renderProfile();

  try {
    const compat = await fetchCompatibility();
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
      renderProfile();
      refreshHistory();
      if (user?.id) await initBilling(user.id);
    },
  });

  if (!isAuthConfigured()) {
    console.warn('Auth not configured — set env or ensure /api/auth/config is reachable');
  }

  if ($('paywallNote')) {
    $('paywallNote').textContent = isNativeBilling()
      ? `Every moment you catch, scored. No daily cap. (${platformName()})`
      : 'Every moment you catch, scored. No daily cap.';
  }

  await resumeActiveJob({
    onComplete: (result) => {
      applyGeneration(result);
      showScreen('playlist');
      toast('Resumed completed generation');
    },
    onProgress: (p) => {
      showScreen('loading');
      if (p?.message) setLoader(40, 0);
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
