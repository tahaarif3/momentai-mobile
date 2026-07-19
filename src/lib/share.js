/**
 * Native share via temporary Filesystem PNG + Share sheet (Phase 4).
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * @param {Blob} pngBlob
 * @param {string} [title]
 */
export async function sharePngBlob(pngBlob, title = 'MomentAI') {
  const buffer = await pngBlob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const fileName = `momentai-share-${Date.now()}.png`;

  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title,
      text: 'My MomentAI soundtrack',
      url: written.uri,
      dialogTitle: 'Share moment',
    });
  } finally {
    try {
      await Filesystem.deleteFile({
        path: fileName,
        directory: Directory.Cache,
      });
    } catch {
      /* best-effort cleanup */
    }
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Minimal canvas card for scaffold demos. Full share-card design ports in Phase 4.
 */
export async function renderShareCardPng({ title = 'MomentAI', subtitle = '' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#261e16');
  gradient.addColorStop(1, '#17110c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#e9a94f';
  ctx.font = '700 72px Space Grotesk, sans-serif';
  ctx.fillText('MomentAI', 80, 220);

  ctx.fillStyle = '#ece5da';
  ctx.font = '700 96px Space Grotesk, sans-serif';
  wrapText(ctx, title, 80, 420, 920, 110);

  ctx.fillStyle = '#9a8f80';
  ctx.font = '400 48px Space Mono, monospace';
  ctx.fillText(subtitle || 'one photo · one playlist', 80, 700);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return blob;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}
