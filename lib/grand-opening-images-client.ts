"use client";
import { thumbnailFor } from "./staff-doc-files-client.ts";
import { downscaleImage } from "./image-downscale.ts";
import { resolveMimeType } from "./staff-documents.ts";
import { validOpeningImage } from "./grand-opening-checklist.ts";
export async function prepareOpeningImage(original: File) {
  if (original.size > 30 * 1024 * 1024) throw new Error("รูปต้นฉบับใหญ่เกิน 30MB");
  const mimeType = original.type || resolveMimeType(original.name, original.type) || "";
  if (!mimeType.startsWith("image/")) throw new Error("รับเฉพาะรูปภาพ");
  if (!original.type) original = new File([original], original.name, { type: mimeType, lastModified: original.lastModified });
  const file = await Promise.race([downscaleImage(original), new Promise<File>(resolve => setTimeout(() => resolve(original), 15000))]);
  if (!validOpeningImage(file.type, file.size)) throw new Error("รับรูป JPG, PNG, WebP หรือ GIF ไม่เกิน 4MB หากเป็น HEIC ให้แปลงเป็น JPG ก่อน");
  const thumbnail = await thumbnailFor(file);
  if (!thumbnail) throw new Error("อ่านรูปไม่ได้ ลองบันทึกเป็น JPG แล้วแนบใหม่");
  return { file, thumbnail: new File([await (await fetch(thumbnail)).blob()], "thumbnail.jpg", { type: "image/jpeg" }) };
}
