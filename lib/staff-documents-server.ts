import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { listStaff, type StaffRecord } from "./staff-store.ts";
import { branchConfig } from "./store-config.ts";
import {
  STAFF_DOCS_COLLECTION,
  STAFF_DOCS_HISTORY,
  STAFF_DOCS_STORAGE_PREFIX,
  SHEET_DATE_COLUMNS,
  SHEET_HEADERS,
  SHEET_TEXT_COLUMNS,
  THAI_NICKNAMES,
  driveFileName,
  formFromSheetRow,
  isDocsEligible,
  isTestEmployee,
  notifyMessage,
  sheetRowFor,
  staffFolderName,
  type FileKind,
  type StaffDocForm,
  type StaffDocRecord
} from "./staff-documents.ts";

// ฝั่ง server ของฟอร์มเอกสารพนักงาน.
//
// ทางเดินของข้อมูล:
//   หน้าเว็บ → /api/staff-documents/upload (ไฟล์ → Storage, ไม่มี download token = ไม่มี URL สาธารณะ)
//           → /api/staff-documents (ฟอร์ม → Firestore `pending`) → pushToDrive()
//   pushToDrive → Apps Script web app ของแชมป์ (execute as me) → ไฟล์ลงโฟลเดอร์ใน Drive + upsert แถวในชีต
//   สำเร็จ → ลบ `pending` (ข้อมูลส่วนตัวทั้งหมด) ออกจาก Firestore + ลบไฟล์ใน Storage
//
// หลังขึ้นไดรฟ์แล้ว Firestore เหลือแค่: รหัส ชื่อเล่น อีเมลบัญชี SOP เวลาส่ง จำนวนครั้ง สถานะ
// ลิงก์โฟลเดอร์ และ "ไฟล์ประเภทไหนขึ้นไดรฟ์แล้ว" — ไม่มีเลขบัตร/บัญชี/ที่อยู่/วันเกิดค้าง.

const GAS_TIMEOUT_MS = 45_000;

export function hasDriveBridge(): boolean {
  return Boolean(process.env.STAFF_DOCS_GAS_URL && process.env.STAFF_DOCS_GAS_SECRET);
}

export function nicknameFor(staff: Pick<StaffRecord, "employeeId" | "code" | "displayName" | "name">): string {
  return THAI_NICKNAMES[staff.employeeId] || THAI_NICKNAMES[staff.code] || staff.displayName || staff.name || staff.employeeId;
}

export function docIdFor(staff: Pick<StaffRecord, "employeeId" | "code">): string {
  return (staff.employeeId || staff.code).replace(/\//g, "-");
}

export async function staffForEmail(email: string): Promise<StaffRecord | null> {
  const normalized = email.trim().toLowerCase();
  const records = await listStaff();
  return records.find((record) => record.email === normalized) ?? null;
}

export async function eligibleStaff(): Promise<StaffRecord[]> {
  const records = await listStaff();
  return records.filter((record) => isDocsEligible(record)).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

function collection() {
  return adminDb().collection(STAFF_DOCS_COLLECTION);
}

export async function getDocRecord(docId: string): Promise<StaffDocRecord | null> {
  if (!hasAdminCredentials()) return null;
  const snap = await collection().doc(docId).get();
  return snap.exists ? (snap.data() as StaffDocRecord) : null;
}

export async function listDocRecords(): Promise<Map<string, StaffDocRecord>> {
  const map = new Map<string, StaffDocRecord>();
  if (!hasAdminCredentials()) return map;
  const snap = await collection().get();
  for (const doc of snap.docs) map.set(doc.id, doc.data() as StaffDocRecord);
  return map;
}

/** Firestore ปฏิเสธทั้ง document ถ้ามีคีย์ที่เป็น undefined — ตัดทิ้งก่อนเขียนเสมอ */
export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    out[key] =
      entry && typeof entry === "object" && !Array.isArray(entry) && !(entry instanceof FieldValue)
        ? stripUndefined(entry as Record<string, unknown>)
        : Array.isArray(entry)
          ? entry.map((item) => (item && typeof item === "object" ? stripUndefined(item as Record<string, unknown>) : item))
          : entry;
  }
  return out as T;
}

export function storagePrefixFor(docId: string): string {
  return `${STAFF_DOCS_STORAGE_PREFIX}/${docId}/`;
}

/** path ต้องอยู่ในโฟลเดอร์ของคนนี้เท่านั้น — กันส่ง path ไฟล์ของคนอื่นมาแนบ */
export function isOwnStoragePath(docId: string, path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith(storagePrefixFor(docId)) &&
    !path.includes("..") &&
    /^[A-Za-z0-9_\-./]+$/.test(path)
  );
}

function bangkokLabel(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

type GasResponse = {
  ok: boolean;
  error?: string;
  folderUrl?: string;
  sheetUrl?: string;
  row?: unknown[];
  savedFiles?: Array<{ kind: string; name: string; id: string }>;
};

export async function callDriveBridge(payload: Record<string, unknown>): Promise<GasResponse> {
  const url = process.env.STAFF_DOCS_GAS_URL;
  const secret = process.env.STAFF_DOCS_GAS_SECRET;
  if (!url || !secret) return { ok: false, error: "drive_bridge_not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);
  try {
    // Apps Script ตอบ 302 ไปที่ googleusercontent — fetch ตาม redirect ให้เอง
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret }),
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store"
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as GasResponse;
    } catch {
      return { ok: false, error: `bad_response_${res.status}` };
    }
  } catch (error) {
    return { ok: false, error: controller.signal.aborted ? "timeout" : String(error).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ส่งข้อมูลที่ค้างอยู่ของคนหนึ่งขึ้น Drive. Idempotent: Apps Script ใช้ submissionId กันไฟล์ซ้ำ
 * (ไฟล์ที่ description = submissionId อยู่แล้วจะไม่ถูกสร้างใหม่) และ upsert แถวด้วยรหัสพนักงาน
 * — กดซ้ำ/ลองใหม่กี่รอบก็ได้ผลเดียวกัน.
 */
export async function pushToDrive(docId: string, options: { attempts?: number } = {}): Promise<StaffDocRecord | null> {
  const ref = collection().doc(docId);
  const record = await getDocRecord(docId);
  if (!record || !record.pending) return record;

  const staff = (await listStaff()).find((row) => docIdFor(row) === docId);
  const branchLabel = staff ? branchConfig(staff.branch).shortName : "";
  const { pending } = record;

  let files: Array<{ kind: FileKind; name: string; mimeType: string; base64: string }> = [];
  try {
    const bucket = adminBucket();
    let otherIndex = 0;
    files = await Promise.all(
      pending.files
        .filter((file) => file.storagePath)
        .map(async (file) => {
          const [buffer] = await bucket.file(file.storagePath as string).download();
          const index = file.kind === "other" ? otherIndex++ : 0;
          return {
            kind: file.kind,
            name: driveFileName(record.employeeId, record.nickname, file.kind, file.mimeType, index),
            mimeType: file.mimeType,
            base64: buffer.toString("base64")
          };
        })
    );
  } catch (error) {
    await ref.update({ status: "drive_failed", driveError: `storage: ${String(error).slice(0, 140)}`, driveAttempts: FieldValue.increment(1) });
    return getDocRecord(docId);
  }

  const payload = {
    action: "submit",
    submissionId: pending.submissionId,
    employeeId: record.employeeId,
    folderName: staffFolderName(record.employeeId, record.nickname),
    headers: SHEET_HEADERS,
    dateColumns: SHEET_DATE_COLUMNS,
    textColumns: SHEET_TEXT_COLUMNS,
    row: sheetRowFor(pending.form, {
      employeeId: record.employeeId,
      nickname: record.nickname,
      branchLabel,
      submittedAtLabel: bangkokLabel(record.submittedAt),
      submitCount: record.submitCount
    }),
    files,
    test: isTestEmployee(record.employeeId)
  };

  const tries = Math.max(1, options.attempts ?? 2);
  let result: GasResponse = { ok: false, error: "not_attempted" };
  for (let attempt = 0; attempt < tries; attempt += 1) {
    result = await callDriveBridge(payload);
    if (result.ok) break;
  }

  if (!result.ok) {
    await ref.update({
      status: "drive_failed",
      driveError: String(result.error || "unknown").slice(0, 160),
      driveAttempts: FieldValue.increment(tries)
    });
    return getDocRecord(docId);
  }

  // สำเร็จ → ลบข้อมูลส่วนตัวออกจาก Firestore ก่อน แล้วค่อยลบไฟล์ใน Storage
  const filesOnDrive = Array.from(new Set([...(record.filesOnDrive || []), ...pending.files.map((file) => file.kind)]));
  await ref.update(
    stripUndefined({
      status: "on_drive",
      driveSyncedAt: new Date().toISOString(),
      driveFolderUrl: result.folderUrl,
      sheetUrl: result.sheetUrl,
      driveError: FieldValue.delete(),
      filesOnDrive,
      pending: FieldValue.delete()
    })
  );
  await ref
    .collection(STAFF_DOCS_HISTORY)
    .doc(pending.submissionId)
    .set({ driveStatus: "on_drive", driveSyncedAt: new Date().toISOString() }, { merge: true })
    .catch(() => undefined);
  await deleteStorageFor(docId).catch(() => undefined);
  return getDocRecord(docId);
}

/** ลบทุกไฟล์ใต้โฟลเดอร์ของคนนี้ใน Storage (รวมไฟล์ที่อัปแล้วไม่ได้กดส่ง) */
export async function deleteStorageFor(docId: string): Promise<void> {
  await adminBucket().deleteFiles({ prefix: storagePrefixFor(docId), force: true });
}

/** ข้อมูลเดิมจากชีตใน Drive — ใช้ตอนกด "แก้ไข" หลังขึ้นไดรฟ์แล้ว (ของตัวเองเท่านั้น) */
export async function fetchSubmittedForm(employeeId: string): Promise<StaffDocForm | null> {
  const result = await callDriveBridge({ action: "get", employeeId });
  if (!result.ok || !Array.isArray(result.row)) return null;
  return formFromSheetRow(result.row);
}

/** แจ้งแชมป์ทาง Telegram ผ่าน Vera — plain text, ไม่มีข้อมูลส่วนตัว. ล้มเหลวได้ ไม่กระทบการส่ง */
export async function notifyOwner(input: { nickname: string; employeeId: string; submitCount: number }): Promise<void> {
  const test = isTestEmployee(input.employeeId) || process.env.VERCEL_ENV !== "production";
  await adminDb()
    .collection("vera-notifications")
    .add({
      message: notifyMessage({ ...input, test }),
      status: "pending",
      source: "sop-staff-documents",
      createdAt: FieldValue.serverTimestamp()
    });
}
