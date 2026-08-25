"use client";

// Client-side image downscaler for evidence uploads.
//
// Why: staff attach photos straight from a phone camera (often 3–12 MB). Those either got
// rejected by the old 5 MB client cap, or — the subtle one — slipped past it at ~4.5–5 MB
// and then failed on Vercel, whose serverless request-body limit (~4.5 MB) is *below* our
// client cap. Either way the user saw "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" (bug ticket
// 0Fxe4Q9TTNTtD1BI6dq9, Android mobile /checklist).
//
// Fix: shrink to a sane max dimension + re-encode as JPEG in the browser before upload, so
// every evidence photo lands well under the platform limit (~200–600 KB) and uploads fast on
// mobile data. Evidence photos are proof-of-work, not archival — 1600px/JPEG is plenty.
//
// Best-effort: if anything fails (unsupported codec like some HEIC, canvas blocked, tiny
// non-photo file) we return the original File untouched and let the existing size guard apply.

const MAX_DIMENSION = 1600; // longest edge, px
const JPEG_QUALITY = 0.82;
// Files already small enough to be safely under the platform body limit skip re-encoding.
const SKIP_BELOW_BYTES = 1024 * 1024; // 1 MB

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    img.src = url;
  });
}

export async function downscaleImage(file: File): Promise<File> {
  // Only touch raster images; leave PDFs / non-images (assign-attachment PDFs) alone.
  if (!file.type.startsWith("image/")) return file;
  // GIFs would lose animation; SVGs are already tiny — skip both.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const img = await loadImage(file);
    const { width, height } = img;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    // If re-encoding somehow produced a larger file (rare, already-optimized small JPEG),
    // keep whichever is smaller.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file; // decode/encode failed — upstream size guard still applies
  }
}
