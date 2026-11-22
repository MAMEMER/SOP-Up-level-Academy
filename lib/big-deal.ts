import { isVoided, type MistakeRecord } from "./mistake-log.ts";

export type BigDealConfig = { minTotal: number; ratePct: number; capPerDeal: number };
export type DealShare = { staffCode: string; percent: number };
export type DealStatus = "logged" | "manager_checked" | "approved" | "paid" | "rejected";
export const DEFAULT_BIG_DEAL_CONFIG: BigDealConfig = { minTotal: 10000, ratePct: 3, capPerDeal: 3000 };

export function validateConfig(config: BigDealConfig): boolean {
  return Number.isFinite(config.minTotal) && config.minTotal >= 0 && Number.isFinite(config.ratePct) && config.ratePct >= 0 && config.ratePct <= 100 && Number.isSafeInteger(config.capPerDeal) && config.capPerDeal >= 0;
}

export function validateShares(shares: DealShare[]): boolean {
  return shares.length > 0 && shares.every((s) => /^[A-Za-z0-9_-]{1,30}$/.test(s.staffCode) && Number.isInteger(s.percent) && s.percent > 0 && s.percent <= 100) && new Set(shares.map((s) => s.staffCode.toUpperCase())).size === shares.length && shares.reduce((sum, s) => sum + s.percent, 0) === 100;
}

export function hasIntentionalMistake(records: MistakeRecord[], staffCode: string, month: string): boolean {
  return records.some((record) => record.staffCode === staffCode && record.date.slice(0, 7) === month && record.level === "intentional" && !isVoided(record));
}

/** Allocate whole baht with largest remainders; ineligible shares are withheld, not redistributed. */
export function calculateBigDeal(total: number, config: BigDealConfig, shares: DealShare[], month: string, mistakes: MistakeRecord[]) {
  if (!Number.isFinite(total) || total < 0 || !validateConfig(config) || !validateShares(shares) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("invalid_big_deal");
  const bonus = total >= config.minTotal ? Math.min(Math.round(total * config.ratePct / 100), config.capPerDeal) : 0;
  const allocated = shares.map((share, index) => {
    const raw = bonus * share.percent / 100;
    return { ...share, index, amount: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = bonus - allocated.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    share.amount++;
  }
  return { eligible: total >= config.minTotal, bonus, shares: allocated.map(({ staffCode, percent, amount }) => ({ staffCode, percent, eligible: !hasIntentionalMistake(mistakes, staffCode, month), amount: hasIntentionalMistake(mistakes, staffCode, month) ? 0 : amount })) };
}

export function canTransition(from: DealStatus, to: DealStatus, reason = ""): boolean {
  if (to === "rejected") return (from === "logged" || from === "manager_checked" || from === "approved") && reason.trim().length > 0;
  return (from === "logged" && to === "manager_checked") || (from === "manager_checked" && to === "approved") || (from === "approved" && to === "paid");
}
