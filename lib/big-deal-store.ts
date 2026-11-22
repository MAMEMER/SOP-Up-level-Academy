import "server-only";
import { createHash } from "node:crypto";
import { hasSessionSecret } from "./session-jwt.ts";
import { adminDb } from "./firebase-admin.ts";
import { calculateBigDeal, canTransition, validateConfig, type BigDealConfig, type DealShare, type DealStatus } from "./big-deal.ts";
import type { MistakeRecord } from "./mistake-log.ts";

export type BigDeal = { id: string; date: string; receipt: string; total: number; note: string; shares: DealShare[]; staffCodes: string[]; status: DealStatus; reason: string; createdBy: string; createdAt: string; config: BigDealConfig; result: ReturnType<typeof calculateBigDeal> };
export async function getConfig(): Promise<BigDealConfig | null> {
  if (!hasSessionSecret()) return null;
  const data = (await adminDb().doc("sop_config/big_deal").get()).data() as BigDealConfig | undefined;
  return data && validateConfig(data) ? { minTotal: data.minTotal, ratePct: data.ratePct, capPerDeal: data.capPerDeal } : null;
}
export async function listDeals(month: string, staffCode?: string): Promise<BigDeal[]> {
  if (!hasSessionSecret()) return [];
  const col = adminDb().collection("big_deals");
  const query = staffCode ? col.where("staffCodes", "array-contains", staffCode) : col.where("month", "==", month);
  return (await query.get()).docs.map(doc => doc.data() as BigDeal).filter(deal => deal.date.startsWith(month)).sort((a,b) => b.date.localeCompare(a.date));
}
export async function createDeal(input: Omit<BigDeal, "id" | "status" | "reason" | "createdAt" | "config" | "result" | "staffCodes">, mistakes: MistakeRecord[]) {
  const db = adminDb();
  const id = createHash("sha256").update(input.receipt.trim().toUpperCase()).digest("hex");
  const ref = db.collection("big_deals").doc(id);
  await db.runTransaction(async tx => {
    const [existing, cfg] = await Promise.all([tx.get(ref), tx.get(db.doc("sop_config/big_deal"))]);
    if (existing.exists) throw new Error("duplicate");
    const config = cfg.data() as BigDealConfig | undefined;
    if (!config || !validateConfig(config)) throw new Error("config");
    const result = calculateBigDeal(input.total, config, input.shares, input.date.slice(0,7), mistakes);
    tx.create(ref, { ...input, id, month: input.date.slice(0,7), staffCodes: input.shares.map(s => s.staffCode), status: "logged", reason: "", createdAt: new Date().toISOString(), config: { minTotal: config.minTotal, ratePct: config.ratePct, capPerDeal: config.capPerDeal }, result });
  });
}
export async function transitionDeal(id: string, to: DealStatus, reason: string, by: string, mistakes: MistakeRecord[]) {
  const db = adminDb(); const ref = db.collection("big_deals").doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref); const deal = snap.data() as BigDeal | undefined;
    if (!deal || !canTransition(deal.status, to, reason)) throw new Error("transition");
    const result = calculateBigDeal(deal.total, deal.config, deal.shares, deal.date.slice(0,7), mistakes);
    tx.update(ref, { status: to, reason: to === "rejected" ? reason : "", result, updatedBy: by, updatedAt: new Date().toISOString() });
  });
}
