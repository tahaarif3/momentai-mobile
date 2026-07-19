/**
 * Phase 4 — Native share: canvas PNG → Filesystem temp → Share sheet → cleanup.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { track } from './analytics.js';

export async function sharePlaylistCard({ title, moodLine, imageUrl, playlistMeta }) {
  const dataUrl = await rasterizeShareCard({ title, moodLine, imageUrl, playlistMeta });

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

export async function rasterizeShareCard({ title, moodLine, imageUrl, playlistMeta }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#17110c');
  grad.addColorStop(1, '#2a1f16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl);
      const pad = 72;
      const photoH = 640;
      ctx.save();
      roundRect(ctx, pad, 160, W - pad * 2, photoH, 24);
      ctx.clip();
      drawCover(ctx, img, pad, 160, W - pad * 2, photoH);
      ctx.restore();
    } catch (err) {
      console.warn('Share card image blocked (check Spaces CORS)', err);
    }
  }

  ctx.fillStyle = '#e9a94f';
  ctx.font = '600 28px "Space Mono", monospace';
  ctx.fillText('MOMENTAI', 72, 100);

  ctx.fillStyle = '#ece5da';
  ctx.font = '700 64px "Space Grotesk", sans-serif';
  wrapText(ctx, title || 'Your moment', 72, 880, W - 144, 72);

  ctx.fillStyle = '#9a8f80';
  ctx.font = '400 32px "Space Mono", monospace';
  wrapText(ctx, moodLine || '', 72, 1040, W - 144, 40);

  ctx.fillStyle = '#6b6156';
  ctx.font = '400 24px "Space Mono", monospace';
  ctx.fillText(playlistMeta || 'momentai.dev', 72, H - 72);

  return canvas.toDataURL('image/png');
}

// Back-compat for earlier scaffold helpers
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
