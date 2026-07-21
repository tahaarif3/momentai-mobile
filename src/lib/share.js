/**
 * Phase 4 — Native share: canvas PNG → Filesystem temp → Share sheet → cleanup.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { track } from './analytics.js';

const PALETTE = ['#c47b3a', '#8a6f52', '#2e3a4d', '#e3c48d'];
const EQ_HEIGHTS = [
  14, 22, 18, 26, 16, 24, 12, 28, 20, 18, 30, 14, 22, 16, 26, 20, 18, 24, 12, 28, 16, 22, 20,
  18,
];

export function buildShareCardDom({ title, moodLine, imageUrl, playlistMeta, dateLabel }) {
  const eqBars = EQ_HEIGHTS.map(
    (h, i) => `<span class="share-eq-bar" style="height:${h}px"></span>`,
  ).join('');
  const palette = PALETTE.map((c) => `<span style="background:${c}"></span>`).join('');
  const photoStyle = imageUrl
    ? `style="background-image:url('${String(imageUrl).replace(/'/g, '%27')}')"`
    : '';
  return `<div class="share-card-dom">
    <div class="share-card-header">
      <span style="color:var(--accent)">${dateLabel || 'today'}</span>
      <span class="dim">${playlistMeta || 'momentai.app'}</span>
    </div>
    <div class="share-card-photo" ${photoStyle}></div>
    <h3 class="share-card-title">${escapeHtml(title || 'Your moment')}</h3>
    <p class="share-card-mood">${escapeHtml(moodLine || '')}</p>
    <div class="share-eq">${eqBars}</div>
    <div class="share-card-footer">
      <span class="share-brand"><span class="share-brand-dot"></span>momentai.app</span>
      <span class="share-palette">${palette}</span>
    </div>
  </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sharePlaylistCard({ title, moodLine, imageUrl, playlistMeta, dateLabel }) {
  const dataUrl = await rasterizeShareCard({ title, moodLine, imageUrl, playlistMeta, dateLabel });

  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'momentai-share.png';
    a.click();
    track('share_card', { via: 'web' });
    return dataUrl;
  }

  const base64 = dataUrl.split(',')[1];
  const fileName = `momentai-share-${Date.now()}.png`;
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: title || 'MomentAI',
      text: moodLine || 'My MomentAI playlist',
      url: written.uri,
      dialogTitle: 'Share your moment',
    });
    track('share_card', { via: Capacitor.getPlatform() });
  } finally {
    try {
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
    } catch {
      /* ignore */
    }
  }
  return dataUrl;
}

export async function rasterizeShareCard({ title, moodLine, imageUrl, playlistMeta, dateLabel }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, '#2c1e10');
  grad.addColorStop(1, '#17110c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(233,169,79,0.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, 48, 48, W - 96, H - 96, 44);
  ctx.stroke();

  ctx.fillStyle = '#e9a94f';
  ctx.font = '400 28px "Space Mono", monospace';
  ctx.fillText(String(dateLabel || 'today').toUpperCase(), 88, 110);

  ctx.fillStyle = '#746a5a';
  ctx.textAlign = 'right';
  ctx.fillText(playlistMeta || 'momentai.app', W - 88, 110);
  ctx.textAlign = 'left';

  const photoY = 140;
  const photoH = 450;
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl);
      ctx.save();
      roundRect(ctx, 88, photoY, W - 176, photoH, 24);
      ctx.clip();
      drawCover(ctx, img, 88, photoY, W - 176, photoH);
      ctx.restore();
    } catch (err) {
      console.warn('Share card image blocked (check Spaces CORS)', err);
      ctx.fillStyle = '#241c15';
      roundRect(ctx, 88, photoY, W - 176, photoH, 24);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#241c15';
    roundRect(ctx, 88, photoY, W - 176, photoH, 24);
    ctx.fill();
  }

  ctx.fillStyle = '#efe9df';
  ctx.font = '700 64px "Space Grotesk", sans-serif';
  wrapText(ctx, title || 'Your moment', 88, photoY + photoH + 80, W - 176, 72);

  ctx.fillStyle = '#a49883';
  ctx.font = '400 32px "Space Mono", monospace';
  wrapText(ctx, moodLine || '', 88, photoY + photoH + 200, W - 176, 40);

  const eqY = photoY + photoH + 280;
  const barW = (W - 176 - 23 * 8) / 24;
  EQ_HEIGHTS.forEach((h, i) => {
    const x = 88 + i * (barW + 8);
    ctx.fillStyle = i % 3 === 2 ? '#e9a94f' : 'rgba(233,169,79,0.35)';
    ctx.fillRect(x, eqY + (30 - h) * 3, barW, h * 3);
  });

  ctx.fillStyle = '#e9a94f';
  ctx.beginPath();
  ctx.arc(100, H - 100, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '400 28px "Space Mono", monospace';
  ctx.fillText('momentai.app', 120, H - 92);

  PALETTE.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(W - 88 - i * 36, H - 96, 14, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas.toDataURL('image/png');
}

export async function renderShareCardPng(opts) {
  const dataUrl = await rasterizeShareCard(opts);
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function sharePngBlob(pngBlob, title = 'MomentAI') {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'momentai-share.png';
    a.click();
    return;
  }
  const buffer = await pngBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const fileName = `momentai-share-${Date.now()}.png`;
  const written = await Filesystem.writeFile({
    path: fileName,
    data: btoa(binary),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title, url: written.uri, dialogTitle: 'Share moment' });
  } finally {
    try {
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
    } catch {
      /* ignore */
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const br = w / h;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > br) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / ir;
    dx = x;
    dy = y - (dh - h) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
