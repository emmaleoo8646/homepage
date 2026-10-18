"use client";

/**
 * Read an image File from an `<input type="file">` into a data URL, with
 * automatic downscale so we don't blow up localStorage / the sync payload.
 *
 * Strategy:
 *  - small + already PNG/JPEG/WebP → use FileReader output directly
 *  - otherwise rasterize via <canvas> at most `maxSize` × `maxSize` (default
 *    96×96, plenty for a 60px favicon-style slot)
 *  - if the resulting PNG data URL is still bigger than `maxBytes`, retry
 *    as JPEG quality 0.7 (visually identical at this size, much smaller)
 *  - SVG / unknown decoders fall back to the raw FileReader data URL so
 *    uploading a small SVG still works
 */
export interface CompressOpts {
  maxSize?: number;
  maxBytes?: number;
}

export async function readImageFile(
  file: File,
  opts: CompressOpts = {},
): Promise<string> {
  const maxSize = opts.maxSize ?? 96;
  const maxBytes = opts.maxBytes ?? 50 * 1024;

  const original = await readDataUrl(file);

  // Cheap path: small + supported type. Skip the canvas round-trip.
  if (file.size <= maxBytes && /image\/(png|jpeg|webp)/.test(file.type)) {
    return original;
  }

  // Rasterize via canvas to apply downscaling + re-encoding.
  try {
    const downscaled = await downscale(original, maxSize, maxBytes);
    return downscaled;
  } catch {
    // SVG / unsupported MIME — keep the original base64 unchanged.
    return original;
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function downscale(
  dataUrl: string,
  maxSize: number,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width >= height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2d context unavailable"));
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let out = canvas.toDataURL("image/png");
      // base64 expands ~33% on top of the raw byte budget.
      if (out.length > maxBytes * 1.4) {
        out = canvas.toDataURL("image/jpeg", 0.7);
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = dataUrl;
  });
}
