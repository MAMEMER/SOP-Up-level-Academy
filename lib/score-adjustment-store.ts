import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import {
  buildScoreAdjustment,
  SCORE_ADJUSTMENT_COLLECTION,
  type ScoreAdjustment,
  type ScoreAdjustmentInput
} from "./score-adjustments.ts";

// Written with the service account, like the stock checks and the checklist audits: an
// adjustment moves a score that decides a salary deduction, so it must not be writable
// with the public client key.

const LOCAL_STORE = join(process.cwd(), ".data", "score-adjustments.json");
const runningOnVercel = Boolean(process.env.VERCEL);

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<ScoreAdjustment[]> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8"));
    return Array.isArray(parsed) ? (parsed as ScoreAdjustment[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: ScoreAdjustment[]) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(records, null, 2), "utf8");
}

export async function fetchScoreAdjustments(): Promise<ScoreAdjustment[]> {
  const mode = storageMode();
  const records =
    mode === "firestore"
      ? (await adminDb().collection(SCORE_ADJUSTMENT_COLLECTION).get()).docs.map((doc) => doc.data() as ScoreAdjustment)
      : mode === "local-file"
        ? await readLocalStore()
        : [];
  return records.sort((left, right) => left.workDate.localeCompare(right.workDate));
}

export async function saveScoreAdjustment(input: ScoreAdjustmentInput): Promise<ScoreAdjustment> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("score_adjustment_storage_unavailable");

  const record = buildScoreAdjustment(input);
  if (mode === "firestore") {
    await adminDb().collection(SCORE_ADJUSTMENT_COLLECTION).doc(record.id).set(record);
  } else {
    await writeLocalStore([...(await readLocalStore()).filter((row) => row.id !== record.id), record]);
  }
  return record;
}

export async function deleteScoreAdjustment(id: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("score_adjustment_storage_unavailable");

  if (mode === "firestore") {
    await adminDb().collection(SCORE_ADJUSTMENT_COLLECTION).doc(id).delete();
  } else {
    await writeLocalStore((await readLocalStore()).filter((row) => row.id !== id));
  }
}
