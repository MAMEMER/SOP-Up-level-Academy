import { monthlyGroupScores, type MistakeRecord } from "./mistake-log.ts";
import { MIN_RATERS_TO_SHOW, scorePeerReviews, type PeerReviewRecord } from "./peer-review.ts";

export type Position = "temporary" | "regular" | "branch_manager";
export type PersonNumbers = { advanced?: number; sales?: number; members?: number; events?: number };
export type StoreNumbers = { store?: number; byBranch?: Record<string, number> };
export type KpiPerson = { code: string; branch: string; position?: Position; numbers?: PersonNumbers };
export type Group = "basic" | "advanced" | "revenue" | "team";
export type MissingPart = Group | "sales" | "members" | "events" | "store";
export const groupLabels: Record<Group, string> = { basic: "งานพื้นฐาน", advanced: "งานขั้นสูง", revenue: "สร้างรายได้", team: "ทีมและการสื่อสาร" };
export const missingLabels: Record<MissingPart, string> = { ...groupLabels, sales: "ยอดขายสินค้าของเรา", members: "สมาชิกที่เราชวน", events: "คนมาอีเวนต์ที่เราชวน", store: "ยอดขายทั้งร้าน" };
export const positionLabels: Record<Position, string> = { temporary: "ชั่วคราว", regular: "ประจำ", branch_manager: "ผู้จัดการสาขา" };
const groups: Group[] = ["basic", "advanced", "revenue", "team"];
const weights: Record<Position, number[]> = { temporary: [40, 15, 30, 15], regular: [25, 25, 35, 15], branch_manager: [15, 20, 40, 25] };
const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function calculateKpiV2(period: string, people: KpiPerson[], mistakes: MistakeRecord[], reviews: PeerReviewRecord[], store: StoreNumbers = {}) {
  return people.map(person => {
    const position = person.position || "regular";
    const basic = average(monthlyGroupScores(mistakes, person.code, period).map(s => s.score));
    const advanced = valid(person.numbers?.advanced) ? person.numbers.advanced : null;
    const parts = (["sales", "members", "events"] as const).map(key => ({ key, score: valid(person.numbers?.[key]) ? person.numbers![key]! : null }));
    const branchStore = store.byBranch?.[person.branch];
    const storeScore = position === "branch_manager" ? (valid(branchStore) ? branchStore : null) : (valid(store.store) ? store.store : null);
    const revenue = average([...parts.map(part => part.score), storeScore].filter(valid));
    const peer = scorePeerReviews(reviews.filter(r => r.period === period), person.code);
    const team = peer.raters >= MIN_RATERS_TO_SHOW && valid(peer.score) ? peer.score : null;
    const values = [basic, advanced, revenue, team];
    const applicable = groups.map((group, i) => ({ group, weight: weights[position][i], score: values[i] }));
    const missing: MissingPart[] = applicable.filter(x => x.score === null && x.group !== "revenue").map(x => x.group);
    for (const part of parts) if (part.score === null) missing.push(part.key);
    if (storeScore === null) missing.push("store");
    const available = applicable.filter(x => x.score !== null);
    const totalWeight = available.reduce((sum, x) => sum + x.weight, 0);
    const rawTotal = totalWeight ? available.reduce((sum, x) => sum + x.score! * x.weight, 0) / totalWeight : null;
    const capped = storeScore !== null && storeScore < 90 && rawTotal !== null && rawTotal > 89.9;
    const total = capped ? 89.9 : rawTotal;
    const incentiveEligible = basic !== null && basic >= 90;
    const band = total === null ? null : total < 50 ? "เตือน" : total < 90 || !incentiveEligible ? "ผ่าน" : "incentive";
    return { person, position, groups: applicable, missing, total, capped, incentiveEligible, band, trial: period < "2027-01", warning: period >= "2027-01" && band === "เตือน" };
  });
}
