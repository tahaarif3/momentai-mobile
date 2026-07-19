/**
 * Camera / photo library pipeline (Phase 3).
 * Phase 1: URI-based capture stubs + Blob conversion helpers.
 */

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * @param {'camera' | 'photos'} source
 */
export async function pickImage(source = 'photos') {
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    correctOrientation: true,
  });

  return {
    webPath: photo.webPath,
    path: photo.path,
    format: photo.format,
  };
}

/**
 * Convert a Capacitor photo webPath/path into a File for multipart upload.
 * HEIC → JPEG conversion / compression lands in Phase 3.
 */
export async function photoToFile(photo, filename = 'moment.jpg') {
  if (!photo?.webPath) {
    throw new Error('Photo is missing webPath');
  }

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const type = blob.type || `image/${photo.format || 'jpeg'}`;
  return new File([blob], filename, { type });
}

/**
 * Placeholder compressor — returns the input File until Phase 3 lands sharp-ish client resize.
 * Target: JPEG ~2–4 MB without location EXIF.
 */
export async function compressForUpload(file, _opts = {}) {
  return file;
}
