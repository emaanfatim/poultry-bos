// Resizes + re-encodes an image file into a small JPEG data URL entirely in
// the browser. There's no cloud storage (S3/R2/etc.) wired up for this
// project, so product photos are stored as compressed data URLs directly in
// the database — this keeps files small enough for that to be reasonable.

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.8;

export class ImageProcessingError extends Error {}

export async function fileToProductImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageProcessingError("Please choose an image file.");
  }

  const bitmap = await loadBitmap(file);

  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ImageProcessingError("Couldn't process this image on this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  // Rough cap matching the ~2MB server-side limit, with headroom.
  if (dataUrl.length > 1_500_000) {
    throw new ImageProcessingError("Image is too large even after compression — try a smaller photo.");
  }

  return dataUrl;
}

// Same "no cloud storage, store a compressed data URL" approach as
// fileToProductImage, tuned for a receipt logo instead of a product photo:
// smaller max dimension (it only ever prints a couple centimeters wide on
// an 80mm receipt) and PNG output so a transparent logo stays transparent
// on the receipt's paper-cream background instead of picking up a JPEG
// white matte.
const LOGO_MAX_DIMENSION = 320;

export async function fileToLogoImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageProcessingError("Please choose an image file.");
  }

  const bitmap = await loadBitmap(file);

  let { width, height } = bitmap;
  if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) {
    const scale = LOGO_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ImageProcessingError("Couldn't process this image on this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/png");

  if (dataUrl.length > 1_500_000) {
    throw new ImageProcessingError("Logo is too large even after compression — try a smaller image.");
  }

  return dataUrl;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> based loading below
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageProcessingError("Couldn't read this image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
