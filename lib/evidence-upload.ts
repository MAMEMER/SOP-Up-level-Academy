"use client";

// Client helper: POST one evidence image to the server route, which uploads it to Firebase
// Storage with the service account (authorized by the SOP session cookie). No client-side
// Firebase Auth is involved, so a logged-in user whose Firebase Auth session has lapsed can
// still upload — fixes "อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน" while already logged in.

const ERRORS: Record<string, string> = {
  read_only_view: "โหมดดูอย่างเดียว — อัปโหลดไม่ได้",
  storage_not_configured: "ระบบอัปโหลดยังไม่พร้อม แจ้งแอดมิน",
  missing_file: "ไม่พบไฟล์",
  not_an_image: "ไฟล์ต้องเป็นรูปภาพ",
  too_large: "รูปต้องไม่เกิน 5MB",
  upload_failed: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง"
};

export async function uploadEvidenceImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/evidence-upload", { method: "POST", body });
  } catch {
    throw new Error("อัปโหลดไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่");
  }

  // requireUser() redirects unauthenticated requests to /login — surface that clearly.
  if (res.redirected || res.status === 401) {
    throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง");
  }

  const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error((data?.error && ERRORS[data.error]) || "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return data.url;
}
