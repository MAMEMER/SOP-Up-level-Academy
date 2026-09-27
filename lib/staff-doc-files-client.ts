"use client";

import { downscaleImage } from "./image-downscale.ts";
import { MAX_FILE_BYTES, resolveMimeType, type FileKind } from "./staff-documents.ts";

// เตรียมไฟล์จากกล้องมือถือก่อนอัปโหลด. ทุกขั้นมีเพดานเวลา — รูป HEIC ที่เบราว์เซอร์ถอดไม่ได้
// เคยทำให้ปุ่มหมุนค้างเงียบๆ (ไม่มี onerror). ที่นี่ถ้าย่อไม่ได้ก็ส่งไฟล์เดิมไป (Drive เปิด HEIC ได้)
// ขอแค่ไม่เกิน 4MB.

const PREP_TIMEOUT_MS = 15_000;
const THUMB_EDGE = 220;

function withTimeout<T>(promise: Promise<T>, fallback: T, ms = PREP_TIMEOUT_MS): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export type PreparedFile = { file: File; mimeType: string };

export async function prepareDocFile(original: File): Promise<PreparedFile> {
  const mimeType = resolveMimeType(original.name, original.type);
  if (!mimeType) throw new Error("รับเฉพาะรูปภาพ (JPG, PNG, HEIC) หรือ PDF");

  let file = original;
  if (mimeType.startsWith("image/")) {
    // downscaleImage คืนไฟล์เดิมเองเมื่อถอดรหัสไม่ได้ — เราแค่กันไม่ให้มันค้าง
    file = await withTimeout(downscaleImage(original), original);
  }
  const finalType = resolveMimeType(file.name, file.type) || mimeType;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      finalType === "application/pdf"
        ? "ไฟล์ PDF ใหญ่เกิน 4MB — ถ่ายรูปเอกสารแทน"
        : "รูปใหญ่เกิน 4MB — ลองถ่ายใหม่ หรือแคปหน้าจอรูปแล้วแนบแทน"
    );
  }
  return { file, mimeType: finalType };
}

/** ภาพย่อเล็กๆ ไว้โชว์ + เก็บใน draft (ถอดรูปไม่ได้ = ไม่มีภาพย่อ ไม่เป็นไร) */
export async function thumbnailFor(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return "";
  const run = new Promise<string>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, THUMB_EDGE / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        resolve("");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
  return withTimeout(run, "", 8_000);
}

const UPLOAD_ERRORS: Record<string, string> = {
  read_only_view: "โหมดดูอย่างเดียว — อัปโหลดไม่ได้",
  storage_not_configured: "ระบบอัปโหลดยังไม่พร้อม แจ้งแอดมิน",
  not_eligible: "บัญชีนี้ไม่ต้องส่งเอกสาร",
  not_allowed_type: "รับเฉพาะรูปภาพ หรือ PDF",
  too_large: "ไฟล์ใหญ่เกิน 4MB",
  upload_failed: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง"
};

export async function uploadDocFile(file: File, kind: FileKind): Promise<{ path: string; mimeType: string; size: number }> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  let res: Response;
  try {
    res = await fetch("/api/staff-documents/upload", { method: "POST", body });
  } catch {
    throw new Error("อัปโหลดไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่");
  }
  if (res.redirected || res.status === 401) throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง");
  const data = (await res.json().catch(() => null)) as { ok?: boolean; path?: string; mimeType?: string; size?: number; error?: string } | null;
  if (!res.ok || !data?.path) throw new Error((data?.error && UPLOAD_ERRORS[data.error]) || "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
  return { path: data.path, mimeType: data.mimeType || file.type, size: data.size || file.size };
}
