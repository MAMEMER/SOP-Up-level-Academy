import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { buildStockCheckRecord, STOCK_CHECK_COLLECTION, type StockCheckRecord, type StockCheckRecordInput } from "./stock-check-records.ts";

// Written with the service account rather than the public REST key: the shared guild
// firestore.rules do not open sop_stock_checks, and a client-key write is refused with
// 403. The admin SDK bypasses rules, so no rule change is needed in the other repo.
//
// Local dev has no service-account credentials (they are write-only on Vercel), so it
// falls back to a JSON file — refused on Vercel, where a serverless filesystem is wiped.

const LOCAL_STORE = join(process.cwd(), ".data", "stock-checks.json");
const runningOnVercel = Boolean(process.env.VERCEL);

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<StockCheckRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8"));
    return Array.isArray(parsed) ? (parsed as StockCheckRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: StockCheckRecord[]) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(records, null, 2), "utf8");
}

export async function fetchStockCheckRecords(): Promise<StockCheckRecord[]> {
  const mode = storageMode();
  const records =
    mode === "firestore"
      ? (await adminDb().collection(STOCK_CHECK_COLLECTION).get()).docs.map((doc) => doc.data() as StockCheckRecord)
      : mode === "local-file"
        ? await readLocalStore()
        : [];
  return records.sort((left, right) => left.workDate.localeCompare(right.workDate));
}

export async function saveStockCheckRecord(input: StockCheckRecordInput): Promise<StockCheckRecord> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("stock_storage_unavailable");

  const record = buildStockCheckRecord(input);
  if (mode === "firestore") {
    // Firestore rejects undefined; the field is simply absent when there is no proof.
    const { evidence, ...rest } = record;
    await adminDb()
      .collection(STOCK_CHECK_COLLECTION)
      .doc(record.id)
      .set(evidence ? { ...rest, evidence } : rest);
  } else {
    await writeLocalStore([...(await readLocalStore()).filter((row) => row.id !== record.id), record]);
  }
  return record;
}

export async function deleteStockCheckRecord(id: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("stock_storage_unavailable");

  if (mode === "firestore") {
    await adminDb().collection(STOCK_CHECK_COLLECTION).doc(id).delete();
  } else {
    await writeLocalStore((await readLocalStore()).filter((row) => row.id !== id));
  }
}
