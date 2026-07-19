/**
 * Phase 3 — Camera / photo library pipeline.
 * Separate permissions, URI → File, JPEG compress ~2–4 MB, HEIC via canvas.
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { track } from './analytics.js';

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.82;
const TARGET_MAX_BYTES = 3.5 * 1024 * 1024;

async function ensurePermission(kind) {
  try {
    const perms = await Camera.checkPermissions();
    const key = kind === 'photos' ? 'photos' : 'camera';
    if (perms[key] === 'granted' || perms[key] === 'limited') return true;
    const req = await Camera.requestPermissions({
      permissions: kind === 'photos' ? ['photos'] : ['camera'],
    });
    if (req[key] === 'granted' || req[key] === 'limited') return true;
    track('camera_permission_denied', { kind, status: req[key] || 'denied' });
    return false;
  } catch (err) {
    track('camera_permission_denied', { kind, status: 'error' });
    throw err;
  }
}

/**
 * Take photo or pick from library. Returns JPEG File (never base64 for upload).
 * @param {{ source?: 'camera' | 'photos' }} [opts]
 */
export async function captureMoment({ source = 'camera' } = {}) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('WEB_FILE_PICKER');
  }

  const kind = source === 'photos' ? 'photos' : 'camera';
  const ok = await ensurePermission(kind);
  if (!ok) {
    const err = new Error(
      kind === 'photos'
        ? 'Photo library permission denied. Enable it in Settings.'
        : 'Camera permission denied. Enable it in Settings.',
    );
    err.code = 'PERMISSION_DENIED';
    throw err;
  }

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === 'photos' ? CameraSource.Photos : CameraSource.Camera,
    correctOrientation: true,
    width: MAX_EDGE,
    height: MAX_EDGE,
  });

  if (!photo?.webPath && !photo?.path) {
    throw new Error('No photo returned from camera.');
  }

  const uri = photo.webPath || Capacitor.convertFileSrc(photo.path);
  const file = await uriToCompressedJpegFile(uri, 'moment-capture.jpg');
  track('camera_capture_ok', { source, bytes: file.size });
  return file;
}

export async function uriToCompressedJpegFile(uri, filename = 'moment.jpg') {
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Failed to read photo URI');
  let blob = await res.blob();
  blob = await compressToJpeg(blob);
  return new File([blob], filename, { type: 'image/jpeg' });
}

async function compressToJpeg(blob) {
  // HEIC and large images → canvas JPEG (strips most EXIF/location in practice).
  // Server Phase 0 also converts HEIC if the client cannot.
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (err) {
    // Unsupported decode (rare HEIC in some WebViews) — send original; server converts.
    console.warn('[camera] decode failed; uploading original for server HEIC convert', err);
    return blob;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  let quality = JPEG_QUALITY;
  let out = await canvasToBlob(canvas, quality);
  while (out.size > TARGET_MAX_BYTES && quality > 0.5) {
    quality -= 0.08;
    out = await canvasToBlob(canvas, quality);
  }
  return out;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Web/dev file input helper with the same compression pipeline */
export async function fileFromInput(file) {
  if (!file) throw new Error('No file');
  const blob = await compressToJpeg(file);
  const base = (file.name || 'moment').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

// Back-compat aliases used by earlier scaffold
export async function pickImage(source = 'photos') {
  const file = await captureMoment({ source });
  return { file, webPath: URL.createObjectURL(file) };
}

export async function photoToFile(photo) {
  if (photo?.file) return photo.file;
  if (photo?.webPath) return uriToCompressedJpegFile(photo.webPath);
  throw new Error('Invalid photo');
}

export async function compressForUpload(file) {
  return fileFromInput(file);
}
