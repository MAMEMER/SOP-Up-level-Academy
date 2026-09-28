import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { employeeDirectory } from "./employee-directory.ts";
import { FLOWER_BILLS_COLLECTION, FLOWER_GRANTS_COLLECTION, bangkokMonth, signedPetals } from "./flower-garden.ts";
import {
  DEFAULT_FLOWER_TARGET,
  FLOWER_TARGET_DOC,
  billCounts,
  leaderboard,
  sanitizeFlowerTarget,
  targetPetalsPerPerson,
  type FlowerTargetSettings,
  type LeaderRow
} from "./flower-target.ts";

// ตัวเลขเป้าดอกไม้ของเดือนเดียว — ใช้ร่วมกันทั้งหน้าตั้งค่าของเจ้าของ แถบเตือนพนักงาน และสวนดอกไม้
// ให้ทุกจอเห็นเลขเดียวกัน ไม่ใช่คนละสูตร

export async function getFlowerTarget(): Promise<FlowerTargetSettings> {
  if (!hasAdminCredentials()) return DEFAULT_FLOWER_TARGET;
  const snap = await adminDb().collection(FLOWER_TARGET_DOC.collection).doc(FLOWER_TARGET_DOC.id).get();
  return snap.exists ? sanitizeFlowerTarget(snap.data()) : DEFAULT_FLOWER_TARGET;
}

export async function saveFlowerTarget(input: unknown, by: string): Promise<FlowerTargetSettings> {
  const clean = sanitizeFlowerTarget(input);
  const record = { ...clean, updatedAt: new Date().toISOString(), updatedBy: by };
  await adminDb().collection(FLOWER_TARGET_DOC.collection).doc(FLOWER_TARGET_DOC.id).set(record);
  return record;
}

export type FlowerMonth = {
  month: string;
  settings: FlowerTargetSettings;
  /** ยอดขายทั้งร้านที่นับเข้าเป้า (บาท) */
  salesBaht: number;
  /** กลีบที่บิลทั้งเดือนแจกได้ (10 ฿ = 1 กลีบ) */
  potentialPetals: number;
  /** เป้าต่อคน */
  targetPetals: number;
  leaderboard: LeaderRow[];
};

function monthWindowIso(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const day = 24 * 3600 * 1000;
  return [new Date(Date.UTC(y, m - 1, 1) - day).toISOString(), new Date(Date.UTC(y, m, 1) + day).toISOString()];
}

export async function getFlowerMonth(month: string = bangkokMonth()): Promise<FlowerMonth> {
  const settings = await getFlowerTarget();
  const roster = employeeDirectory.map((entry) => ({ code: entry.code, name: entry.displayName || entry.code }));
  if (!hasAdminCredentials()) {
    return { month, settings, salesBaht: 0, potentialPetals: 0, targetPetals: 0, leaderboard: leaderboard(roster, new Map()) };
  }

  // อ่านเฉพาะช่วงเดือนนั้น (เผื่อขอบ ±1 วันเพราะเก็บเป็น UTC แต่ตัดเดือนตามเวลาไทย) — แถบนี้ขึ้นทุกหน้าหลัก
  const [from, to] = monthWindowIso(month);
  const [billSnap, grantSnap] = await Promise.all([
    adminDb().collection(FLOWER_BILLS_COLLECTION).where("transactionTime", ">=", from).where("transactionTime", "<", to).get(),
    adminDb().collection(FLOWER_GRANTS_COLLECTION).where("createdAt", ">=", from).where("createdAt", "<", to).get()
  ]);

  let salesBaht = 0;
  let potentialPetals = 0;
  for (const doc of billSnap.docs) {
    const bill = doc.data() as { petals?: number; total?: number; transactionTime?: string };
    if (!billCounts(String(bill.transactionTime || ""), month, settings.startDate)) continue;
    potentialPetals += Number(bill.petals) || 0;
    salesBaht += Number(bill.total) || 0;
  }

  // ฝั่งอ่านเอาแค่รหัสพนักงาน/ชนิด/จำนวนกลีบ — ตัวตนผู้ให้ไม่ถูกแตะเลย
  const net = new Map<string, number>();
  for (const doc of grantSnap.docs) {
    const grant = doc.data() as { staffCode?: string; kind?: string; petals?: number; createdAt?: string };
    if (!grant.staffCode || bangkokMonth(String(grant.createdAt || "")) !== month) continue;
    const signed = signedPetals({ kind: grant.kind === "leaf" ? "leaf" : "flower", petals: Number(grant.petals) || 0 });
    net.set(grant.staffCode, (net.get(grant.staffCode) ?? 0) + signed);
  }

  return {
    month,
    settings,
    salesBaht: Math.round(salesBaht),
    potentialPetals,
    targetPetals: targetPetalsPerPerson(potentialPetals, settings.minPercentOfSales),
    leaderboard: leaderboard(roster, net)
  };
}
