import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "../../../lib/auth.ts";
import { adminBucket, adminStorageBucket, hasAdminCredentials } from "../../../lib/firebase-admin.ts";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, same cap the client enforced

// Storage path prefix per upload kind. Evidence photos (staff checklists) are image-only;
// owner "มอบหมายงาน" attachments also allow PDF (ใบปะหน้า/สลิป). Both go through this one
// server route so neither depends on client Firebase Auth.
const KINDS: Record<string, { prefix: string; allowPdf: boolean }> = {
  evidence: { prefix: "sop-evidence", allowPdf: false },
  "assign-attachment": { prefix: "sop-assign-attachments", allowPdf: true }
};

// POST /api/evidence-upload  (multipart/form-data, field "file", optional field "kind")
// Uploads one evidence image/attachment to Firebase Storage using the service account,
// authorized by the SOP session cookie. This replaces the old browser-direct uploadBytes()
// call, which required a live Firebase Auth session — the 14-day SOP session cookie routinely
// outlives that, so a logged-in user would hit "อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน".
export async function POST(request: Request) {
  // requireUser() redirects unauthenticated requests to /login; a valid SOP cookie is enough.
  const user = await requireUser();
  // Impersonated (view-as) sessions are read-only everywhere else — keep that here too.
  if (user.isImpersonating) {
    return NextResponse.json({ error: "read_only_view" }, { status: 403 });
  }
  if (!hasAdminCredentials()) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  const kind = KINDS[String(form?.get("kind") ?? "evidence")] ?? KINDS.evidence;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !(kind.allowPdf && isPdf)) {
    return NextResponse.json({ error: kind.allowPdf ? "not_allowed_type" : "not_an_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
  const path = `${kind.prefix}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;
  const token = randomUUID();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await adminBucket()
      .file(path)
      .save(buffer, {
        resumable: false,
        contentType: file.type,
        metadata: {
          contentType: file.type,
          // Gives the object a Firebase download token so the public download URL works
          // regardless of uniform bucket-level access — same URL shape as getDownloadURL().
          metadata: { firebaseStorageDownloadTokens: token }
        }
      });

    const url = `https://firebasestorage.googleapis.com/v0/b/${adminStorageBucket}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    return NextResponse.json({ error: "upload_failed", detail: String(error) }, { status: 500 });
  }
}
