import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { actor, canWriteNow, readOnly } from "../../../../lib/api-firestore.ts";
import { adminBucket, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { docIdFor, staffForEmail, storagePrefixFor } from "../../../../lib/staff-documents-server.ts";
import { MAX_FILE_BYTES, extensionFor, isDocsEligible, resolveMimeType, type FileKind } from "../../../../lib/staff-documents.ts";

export const dynamic = "force-dynamic";

const KINDS: FileKind[] = ["idCard", "bankBook", "other"];

// POST /api/staff-documents/upload (multipart: file, kind)
// ไฟล์เอกสารพนักงาน (บัตรประชาชน / สมุดบัญชี) → Storage ด้วย service account.
// ต่างจาก /api/evidence-upload ตรงที่ **ไม่ออก download token** — ไม่มี URL ที่เปิดได้จากภายนอก
// อ่านได้เฉพาะ server (admin SDK) ตอนส่งขึ้น Drive เท่านั้น. Storage rules ปิด client ทั้งหมดอยู่แล้ว.
export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const staff = await staffForEmail(user.email);
  if (!isDocsEligible(staff) || !staff) return NextResponse.json({ error: "not_eligible" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "") as FileKind;
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });

  const mimeType = resolveMimeType(file.name, file.type);
  if (!mimeType) return NextResponse.json({ error: "not_allowed_type" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const path = `${storagePrefixFor(docIdFor(staff))}${Date.now()}-${randomUUID().slice(0, 8)}-${kind}.${extensionFor(mimeType)}`;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await adminBucket()
      .file(path)
      .save(buffer, {
        resumable: false,
        contentType: mimeType,
        metadata: { contentType: mimeType, cacheControl: "private, no-store", metadata: { uploadedBy: user.email, kind } }
      });
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path, mimeType, size: file.size });
}
