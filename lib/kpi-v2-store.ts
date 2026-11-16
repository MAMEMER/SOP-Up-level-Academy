import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { restListCollection } from "./firestore-rest.ts";
import { MISTAKE_LOG_COLLECTION, type MistakeRecord } from "./mistake-log.ts";
import { PEER_REVIEWS_COLLECTION, type PeerReviewRecord, type ShiftCellLite } from "./peer-review.ts";

// ที่เก็บข้อมูล KPI ใหม่ (ค1 บันทึกความผิด · ค2 ประเมิน 360) — เขียนด้วย service account เท่านั้น
// เหมือน skill-review-store: firestore.rules ที่ใช้ร่วมกับกิลด์ไม่ได้เปิดคอลเลกชันนี้.
// ไม่ผูก performance-score / เงินเดือน. Local dev ไม่มี credentials → ไฟล์ JSON (ห้ามบน Vercel).

const LOCAL_STORE = join(process.cwd(), ".data", "kpi-v2.json");
const runningOnVercel = Boolean(process.env.VERCEL);

type LocalStore = { peer: PeerReviewRecord[]; mistakes: MistakeRecord[] };

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocal(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8")) as Partial<LocalStore>;
    return { peer: parsed.peer || [], mistakes: parsed.mistakes || [] };
  } catch {
    return { peer: [], mistakes: [] };
  }
}

async function writeLocal(store: LocalStore) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(store, null, 2), "utf8");
}

// ── ประเมิน 360 ──────────────────────────────────────────────────────────

export async function fetchPeerReviews(period: string): Promise<PeerReviewRecord[]> {
  const mode = storageMode();
  if (mode === "firestore") {
    const snap = await adminDb().collection(PEER_REVIEWS_COLLECTION).where("period", "==", period).get();
    return snap.docs.map((doc) => doc.data() as PeerReviewRecord);
  }
  if (mode === "local-file") return (await readLocal()).peer.filter((record) => record.period === period);
  return [];
}

export async function savePeerReview(record: PeerReviewRecord): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("kpi_v2_storage_unavailable");
  if (mode === "firestore") {
    await adminDb().collection(PEER_REVIEWS_COLLECTION).doc(record.id).set(record);
    return;
  }
  const store = await readLocal();
  await writeLocal({ ...store, peer: [...store.peer.filter((r) => r.id !== record.id), record] });
}

type ShiftDoc = { branch?: string; workDate?: string; staffCode?: string; assignment?: string };

/** วันทำงานจริงตามตารางกะ (s1/s2) ของเดือนนั้น — ใช้หาว่าใครทำกะเดียวกับใคร */
export async function fetchMonthShiftCells(period: string): Promise<ShiftCellLite[]> {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb().collection("schedule_shifts").where("month", "==", period).get();
  const cells = snap.docs.map((doc) => doc.data() as ShiftDoc);
  // บางเดือนเก่าไม่มีฟิลด์ month — ถ้าว่างลองอ่านทั้งคอลเลกชันแล้วกรองตามวันที่
  const source = cells.length ? cells : await restListCollection<ShiftDoc>("schedule_shifts").catch(() => [] as ShiftDoc[]);
  return source
    .filter((cell) => cell.staffCode && cell.workDate?.startsWith(period) && (cell.assignment === "s1" || cell.assignment === "s2"))
    .map((cell) => ({ staffCode: cell.staffCode!, workDate: cell.workDate!, branch: cell.branch || "bangkae" }));
}

// ── บันทึกความผิด ────────────────────────────────────────────────────────

export async function fetchMistakes(staffCode?: string): Promise<MistakeRecord[]> {
  const mode = storageMode();
  if (mode === "firestore") {
    const col = adminDb().collection(MISTAKE_LOG_COLLECTION);
    const snap = await (staffCode ? col.where("staffCode", "==", staffCode) : col).get();
    return snap.docs.map((doc) => doc.data() as MistakeRecord);
  }
  if (mode === "local-file") {
    const all = (await readLocal()).mistakes;
    return staffCode ? all.filter((record) => record.staffCode === staffCode) : all;
  }
  return [];
}

export async function fetchMistake(id: string): Promise<MistakeRecord | undefined> {
  const mode = storageMode();
  if (mode === "firestore") {
    const doc = await adminDb().collection(MISTAKE_LOG_COLLECTION).doc(id).get();
    return doc.exists ? (doc.data() as MistakeRecord) : undefined;
  }
  if (mode === "local-file") return (await readLocal()).mistakes.find((record) => record.id === id);
  return undefined;
}

export async function saveMistake(record: MistakeRecord): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("kpi_v2_storage_unavailable");
  if (mode === "firestore") {
    await adminDb().collection(MISTAKE_LOG_COLLECTION).doc(record.id).set(record);
    return;
  }
  const store = await readLocal();
  await writeLocal({ ...store, mistakes: [...store.mistakes.filter((r) => r.id !== record.id), record] });
}

export async function deleteMistake(id: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("kpi_v2_storage_unavailable");
  if (mode === "firestore") {
    await adminDb().collection(MISTAKE_LOG_COLLECTION).doc(id).delete();
    return;
  }
  const store = await readLocal();
  await writeLocal({ ...store, mistakes: store.mistakes.filter((r) => r.id !== id) });
}
