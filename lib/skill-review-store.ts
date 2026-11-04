import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import {
  SKILL_LEVELS_COLLECTION,
  SKILL_REVIEWS_COLLECTION,
  type SkillLevelsRecord,
  type SkillReviewRecord
} from "./skill-reviews.ts";

// ผลประเมิน skill รายสัปดาห์ (ทดสอบ) — เขียนด้วย service account เหมือน checklist audits:
// firestore.rules ที่ใช้ร่วมกับกิลด์ไม่ได้เปิดคอลเลกชันนี้ และไม่ควรเขียนได้ด้วย public key.
// ไม่ผูก KPI / เงินเดือน. Local dev ไม่มี credentials → ใช้ไฟล์ JSON (ห้ามบน Vercel).

const LOCAL_STORE = join(process.cwd(), ".data", "skill-reviews.json");
const runningOnVercel = Boolean(process.env.VERCEL);

type LocalStore = { reviews: SkillReviewRecord[]; levels: SkillLevelsRecord[] };

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8")) as Partial<LocalStore>;
    return { reviews: parsed.reviews || [], levels: parsed.levels || [] };
  } catch {
    return { reviews: [], levels: [] };
  }
}

async function writeLocalStore(store: LocalStore) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(store, null, 2), "utf8");
}

/** ผลประเมินทุกสัปดาห์ของคนหนึ่ง */
export async function fetchSkillReviewsForStaff(staffCode: string): Promise<SkillReviewRecord[]> {
  const mode = storageMode();
  if (mode === "firestore") {
    const snap = await adminDb().collection(SKILL_REVIEWS_COLLECTION).where("staffCode", "==", staffCode).get();
    return snap.docs.map((doc) => doc.data() as SkillReviewRecord);
  }
  if (mode === "local-file") return (await readLocalStore()).reviews.filter((r) => r.staffCode === staffCode);
  return [];
}

/** ผลประเมินของทุกคนในสัปดาห์หนึ่ง */
export async function fetchSkillReviewsForWeek(weekStart: string): Promise<SkillReviewRecord[]> {
  const mode = storageMode();
  if (mode === "firestore") {
    const snap = await adminDb().collection(SKILL_REVIEWS_COLLECTION).where("weekStart", "==", weekStart).get();
    return snap.docs.map((doc) => doc.data() as SkillReviewRecord);
  }
  if (mode === "local-file") return (await readLocalStore()).reviews.filter((r) => r.weekStart === weekStart);
  return [];
}

export async function saveSkillReview(record: SkillReviewRecord): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("skill_review_storage_unavailable");
  if (mode === "firestore") {
    await adminDb().collection(SKILL_REVIEWS_COLLECTION).doc(record.id).set(record);
    return;
  }
  const store = await readLocalStore();
  await writeLocalStore({ ...store, reviews: [...store.reviews.filter((r) => r.id !== record.id), record] });
}

export async function fetchSkillLevels(staffCode: string): Promise<SkillLevelsRecord | undefined> {
  const mode = storageMode();
  if (mode === "firestore") {
    const doc = await adminDb().collection(SKILL_LEVELS_COLLECTION).doc(staffCode).get();
    return doc.exists ? (doc.data() as SkillLevelsRecord) : undefined;
  }
  if (mode === "local-file") return (await readLocalStore()).levels.find((l) => l.staffCode === staffCode);
  return undefined;
}

export async function saveSkillLevels(record: SkillLevelsRecord): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("skill_review_storage_unavailable");
  if (mode === "firestore") {
    await adminDb().collection(SKILL_LEVELS_COLLECTION).doc(record.staffCode).set(record);
    return;
  }
  const store = await readLocalStore();
  await writeLocalStore({ ...store, levels: [...store.levels.filter((l) => l.staffCode !== record.staffCode), record] });
}
