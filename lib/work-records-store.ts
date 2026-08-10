import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { WORK_RECORDS_COLLECTION, workRecordDocId, workRecordIdRange, type WorkRecordDoc } from "./work-records.ts";

// Storage backend for work records.
//
// Production (Vercel) → Firestore via the service account.
// Local dev → a JSON file, because the service-account env vars are write-only on Vercel
// and can't be pulled down. The file backend is REFUSED on Vercel: a serverless filesystem
// is wiped on every cold start, and silently "saving" to it is exactly the data loss this
// store was built to fix.

const LOCAL_STORE = join(process.cwd(), ".data", "work-records.json");
const runningOnVercel = Boolean(process.env.VERCEL);

export function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<Record<string, WorkRecordDoc>> {
  try {
    return JSON.parse(await readFile(LOCAL_STORE, "utf8")) as Record<string, WorkRecordDoc>;
  } catch {
    return {};
  }
}

async function writeLocalStore(store: Record<string, WorkRecordDoc>) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(store, null, 2), "utf8");
}

/** One owner's document for one scope window, or null. Used to merge against what is already stored. */
export async function readRecord(ownerKey: string, scopeKey: string): Promise<WorkRecordDoc | null> {
  const docId = workRecordDocId(ownerKey, scopeKey);

  if (storageMode() === "firestore") {
    const snapshot = await adminDb().collection(WORK_RECORDS_COLLECTION).doc(docId).get();
    return snapshot.exists ? (snapshot.data() as WorkRecordDoc) : null;
  }
  if (storageMode() === "unavailable") return null;

  const store = await readLocalStore();
  return store[docId] ?? null;
}

/** All documents for one owner whose scopeKey falls in [from, to]. */
export async function listRecordsInRange(ownerKey: string, from: string, to: string): Promise<WorkRecordDoc[]> {
  const range = workRecordIdRange(ownerKey, from, to);

  if (storageMode() === "firestore") {
    const snapshot = await adminDb()
      .collection(WORK_RECORDS_COLLECTION)
      .orderBy(FieldPath.documentId())
      .startAt(range.start)
      .endAt(range.end)
      .get();
    return snapshot.docs.map((doc) => doc.data() as WorkRecordDoc);
  }

  const store = await readLocalStore();
  return Object.entries(store)
    .filter(([id]) => id >= range.start && id <= range.end)
    .map(([, doc]) => doc);
}

/** Every owner's document for one exact scope window (admin review views). */
export async function listRecordsForScopeKey(scopeKey: string): Promise<WorkRecordDoc[]> {
  if (storageMode() === "firestore") {
    const snapshot = await adminDb()
      .collection(WORK_RECORDS_COLLECTION)
      .where("scopeKey", "==", scopeKey)
      .get();
    return snapshot.docs.map((doc) => doc.data() as WorkRecordDoc);
  }

  const store = await readLocalStore();
  return Object.values(store).filter((doc) => doc.scopeKey === scopeKey);
}

export async function upsertRecord(record: WorkRecordDoc): Promise<void> {
  const docId = workRecordDocId(record.employeeKey, record.scopeKey);

  if (storageMode() === "firestore") {
    await adminDb().collection(WORK_RECORDS_COLLECTION).doc(docId).set(record, { merge: true });
    return;
  }
  if (storageMode() === "unavailable") {
    throw new Error("work-record storage is not configured");
  }

  const store = await readLocalStore();
  store[docId] = record;
  await writeLocalStore(store);
}

/** Every owner's documents whose scopeKey falls in [from, to] (KPI aggregation). */
export async function listAllRecordsInScopeRange(from: string, to: string): Promise<WorkRecordDoc[]> {
  if (storageMode() === "firestore") {
    const snapshot = await adminDb()
      .collection(WORK_RECORDS_COLLECTION)
      .where("scopeKey", ">=", from)
      .where("scopeKey", "<=", to)
      .get();
    return snapshot.docs.map((doc) => doc.data() as WorkRecordDoc);
  }

  const store = await readLocalStore();
  return Object.values(store).filter((doc) => doc.scopeKey >= from && doc.scopeKey <= to);
}
