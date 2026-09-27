import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { actor, badRequest, canWriteNow, db, readOnly } from "../../../lib/api-firestore.ts";
import { adminBucket, hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  docIdFor,
  fetchSubmittedForm,
  getDocRecord,
  hasDriveBridge,
  isOwnStoragePath,
  nicknameFor,
  notifyOwner,
  pushToDrive,
  staffForEmail,
  stripUndefined
} from "../../../lib/staff-documents-server.ts";
import {
  MAX_OTHER_FILES,
  STAFF_DOCS_COLLECTION,
  STAFF_DOCS_HISTORY,
  docsStatus,
  filesSatisfied,
  isDocsEligible,
  normalizeForm,
  resolveMimeType,
  staffDocFormSchema,
  validateStaffDocForm,
  type FileKind,
  type StaffDocFileRef,
  type StaffDocForm
} from "../../../lib/staff-documents.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

// ฟอร์มเอกสารพนักงาน (ประกันสังคม / เงินเดือน). ตัวตนมาจาก session เสมอ — ส่งได้แค่ของตัวเอง.
// GET  ?previous=1 → ข้อมูลที่เคยส่ง (สำหรับกด "แก้ไข") ของตัวเองเท่านั้น
// POST              → ส่งฟอร์ม + path ไฟล์ที่อัปโหลดไว้ → เก็บชั่วคราว → push ขึ้น Drive

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FILE_KINDS: FileKind[] = ["idCard", "bankBook", "other"];

export async function GET(request: Request) {
  const { user } = await actor();
  const staff = await staffForEmail(user.email);
  if (!staff || !isDocsEligible(staff)) return NextResponse.json({ eligible: false });

  const record = await getDocRecord(docIdFor(staff));
  const wantPrevious = new URL(request.url).searchParams.get("previous") === "1";
  let previous: StaffDocForm | null = null;
  if (wantPrevious && record) {
    // ยังไม่ขึ้นไดรฟ์ = ข้อมูลยังอยู่ใน pending · ขึ้นแล้ว = อ่านกลับจากชีต
    previous = record.pending?.form ?? (hasDriveBridge() ? await fetchSubmittedForm(record.employeeId) : null);
  }

  return NextResponse.json({
    eligible: true,
    status: docsStatus(record),
    submittedAt: record?.submittedAt ?? null,
    submitCount: record?.submitCount ?? 0,
    filesOnDrive: record?.filesOnDrive ?? [],
    pendingFiles: record?.pending?.files.map((file) => file.kind) ?? [],
    previous
  });
}

type IncomingFile = { kind?: unknown; path?: unknown; originalName?: unknown; mimeType?: unknown; size?: unknown };

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const staff = await staffForEmail(user.email);
  if (!staff || !isDocsEligible(staff)) return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  const docId = docIdFor(staff);

  const body = (await request.json().catch(() => null)) as { form?: unknown; files?: unknown } | null;
  if (!body) return badRequest("invalid_json");

  const parsed = staffDocFormSchema.safeParse(body.form ?? {});
  if (!parsed.success) return badRequest("invalid_form");
  const form = normalizeForm(parsed.data as StaffDocForm);

  // ไฟล์: ต้องเป็น path ในโฟลเดอร์ของตัวเอง และมีอยู่จริงใน Storage
  const incoming = Array.isArray(body.files) ? (body.files as IncomingFile[]) : [];
  const files: StaffDocFileRef[] = [];
  for (const raw of incoming.slice(0, 2 + MAX_OTHER_FILES)) {
    const kind = String(raw.kind) as FileKind;
    const path = String(raw.path ?? "");
    const originalName = String(raw.originalName ?? "").slice(0, 120);
    const mimeType = resolveMimeType(path, String(raw.mimeType ?? ""));
    if (!FILE_KINDS.includes(kind) || !isOwnStoragePath(docId, path) || !mimeType) return badRequest("invalid_file");
    files.push({ kind, storagePath: path, originalName, mimeType, size: Number(raw.size) || 0 });
  }
  if (files.filter((file) => file.kind === "idCard").length > 1 || files.filter((file) => file.kind === "bankBook").length > 1) {
    return badRequest("duplicate_file_kind");
  }
  if (files.filter((file) => file.kind === "other").length > MAX_OTHER_FILES) return badRequest("too_many_files");

  const bucket = adminBucket();
  const exists = await Promise.all(files.map((file) => bucket.file(file.storagePath as string).exists().then(([ok]) => ok)));
  if (exists.includes(false)) return NextResponse.json({ error: "file_missing_reupload" }, { status: 400 });

  const record = await getDocRecord(docId);
  // ส่งซ้ำระหว่างที่ครั้งก่อนยังไม่ขึ้นไดรฟ์: ไฟล์ประเภทที่ไม่ได้แนบใหม่ ใช้ของเดิมที่ค้างอยู่
  for (const old of record?.pending?.files ?? []) {
    if (old.kind !== "other" && !files.some((file) => file.kind === old.kind)) files.push(old);
  }

  const uploaded: Partial<Record<FileKind, boolean>> = {};
  for (const file of files) uploaded[file.kind] = true;
  const issues = validateStaffDocForm(form, {
    today: formatWorkDate(),
    files: filesSatisfied(uploaded, record?.filesOnDrive ?? []),
    employeeId: staff.employeeId
  });
  if (issues.length) return NextResponse.json({ error: "validation", issues }, { status: 400 });

  const submissionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const submitCount = (record?.submitCount ?? 0) + 1;
  const nickname = nicknameFor(staff);
  const ref = db().collection(STAFF_DOCS_COLLECTION).doc(docId);

  await ref.set(
    stripUndefined({
      employeeId: staff.employeeId || staff.code,
      code: staff.code,
      nickname,
      email: staff.email,
      status: "pending_drive",
      submittedAt: now,
      submitCount,
      lastSubmissionId: submissionId,
      driveAttempts: 0,
      driveError: FieldValue.delete(),
      pending: { submissionId, form, files }
    }),
    { merge: true }
  );
  // ประวัติการส่ง — ไม่มีข้อมูลส่วนตัว แค่ใครส่ง เมื่อไร ไฟล์อะไรใหม่
  await ref
    .collection(STAFF_DOCS_HISTORY)
    .doc(submissionId)
    .set({ at: now, by: user.actualEmail, submitCount, newFiles: files.map((file) => file.kind), driveStatus: "pending_drive" });

  const after = hasDriveBridge() ? await pushToDrive(docId, { attempts: 2 }) : await getDocRecord(docId);
  if (!hasDriveBridge()) await ref.update({ status: "drive_failed", driveError: "drive_bridge_not_configured" });

  await notifyOwner({ nickname, employeeId: staff.employeeId || staff.code, submitCount }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    status: hasDriveBridge() ? docsStatus(after) : "drive_failed",
    submittedAt: now,
    submitCount
  });
}
