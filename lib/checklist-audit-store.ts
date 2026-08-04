import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import {
  buildChecklistAuditRecord,
  CHECKLIST_AUDIT_COLLECTION,
  type ChecklistAuditRecord,
  type ChecklistAuditRecordInput
} from "./checklist-audit-records.ts";

// Written with the service account, same as stock checks: the shared guild firestore.rules
// do not open sop_checklist_audits, and a -10 event should not be writable with the public
// client key anyway. The admin SDK bypasses rules, so no rule change in the other repo.
//
// Local dev has no service-account credentials, so it falls back to a JSON file — refused
// on Vercel, where a serverless filesystem is wiped.

const LOCAL_STORE = join(process.cwd(), ".data", "checklist-audits.json");
const runningOnVercel = Boolean(process.env.VERCEL);

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<ChecklistAuditRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8"));
    return Array.isArray(parsed) ? (parsed as ChecklistAuditRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: ChecklistAuditRecord[]) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(records, null, 2), "utf8");
}

export async function fetchChecklistAuditRecords(): Promise<ChecklistAuditRecord[]> {
  const mode = storageMode();
  const records =
    mode === "firestore"
      ? (await adminDb().collection(CHECKLIST_AUDIT_COLLECTION).get()).docs.map((doc) => doc.data() as ChecklistAuditRecord)
      : mode === "local-file"
        ? await readLocalStore()
        : [];
  return records.sort((left, right) => left.workDate.localeCompare(right.workDate));
}

export async function saveChecklistAuditRecord(input: ChecklistAuditRecordInput): Promise<ChecklistAuditRecord> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("checklist_audit_storage_unavailable");

  const record = buildChecklistAuditRecord(input);
  if (mode === "firestore") {
    // Firestore rejects undefined; the field is simply absent when there is no proof.
    const { evidence, ...rest } = record;
    await adminDb()
      .collection(CHECKLIST_AUDIT_COLLECTION)
      .doc(record.id)
      .set(evidence ? { ...rest, evidence } : rest);
  } else {
    await writeLocalStore([...(await readLocalStore()).filter((row) => row.id !== record.id), record]);
  }
  return record;
}

export async function deleteChecklistAuditRecord(id: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("checklist_audit_storage_unavailable");

  if (mode === "firestore") {
    await adminDb().collection(CHECKLIST_AUDIT_COLLECTION).doc(id).delete();
  } else {
    await writeLocalStore((await readLocalStore()).filter((row) => row.id !== id));
  }
}
