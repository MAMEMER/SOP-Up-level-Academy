import { monthlyGroupScores, type MistakeRecord } from "./mistake-log.ts";
import { MIN_RATERS_TO_SHOW, scorePeerReviews, type PeerReviewRecord } from "./peer-review.ts";

export type Position = "temporary" | "regular" | "branch_manager";
export type PersonNumbers = { group12?: number; group22?: number };
export type StoreNumbers = { group4?: number; byBranch?: Record<string, number> };
export type KpiPerson = { code: string; branch: string; position?: Position; numbers?: PersonNumbers };
export type Group = "1.1" | "2.1" | "1.2" | "2.2" | "3" | "4";
export const groupLabels: Record<Group, string> = { "1.1": "หน้าร้านพื้นฐาน", "2.1": "หลังร้านพื้นฐาน", "1.2": "หน้าร้านขั้นสูง", "2.2": "หลังร้านขั้นสูง", "3": "ทีมเวิร์ก", "4": "Ownership" };
export const positionLabels: Record<Position, string> = { temporary: "ชั่วคราว", regular: "ประจำ", branch_manager: "ผู้จัดการสาขา" };
const groups: Group[] = ["1.1", "2.1", "1.2", "2.2", "3", "4"];
const weights: Record<Position, number[]> = { temporary: [30, 30, 10, 0, 15, 15], regular: [20, 20, 15, 15, 15, 15], branch_manager: [10, 10, 15, 15, 25, 25] };
const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function calculateKpiV2(period: string, people: KpiPerson[], mistakes: MistakeRecord[], reviews: PeerReviewRecord[], store: StoreNumbers = {}) {
  const basics = new Map(people.map(p => [p.code, monthlyGroupScores(mistakes, p.code, period)]));
  return people.map(person => {
    const position = person.position || "regular";
    const team = position === "branch_manager" ? people.filter(p => p.branch === person.branch) : people;
    const basic = average(team.flatMap(p => (basics.get(p.code) || []).map(s => s.score)));
    const advanced = average(team.flatMap(p => {
      const w = weights[p.position || "regular"];
      return [w[2] > 0 ? p.numbers?.group12 : undefined, w[3] > 0 ? p.numbers?.group22 : undefined].filter(valid);
    }));
    const peer = scorePeerReviews(reviews.filter(r => r.period === period), person.code);
    const teamParts = [peer.raters >= MIN_RATERS_TO_SHOW ? peer.score : null, basic, advanced];
    // A partial team score would obscure which of its three components is missing.
    const teamScore = teamParts.every(valid) ? teamParts[0]! * 0.6 + teamParts[1]! * 0.3 + teamParts[2]! * 0.1 : null;
    const ownBasic = basics.get(person.code)!;
    const values: (number | null)[] = [ownBasic[0].score, ownBasic[1].score, valid(person.numbers?.group12) ? person.numbers.group12 : null, valid(person.numbers?.group22) ? person.numbers.group22 : null, teamScore, valid(store.byBranch?.[person.branch]) ? store.byBranch![person.branch] : valid(store.group4) ? store.group4 : null];
    const applicable = groups.map((group, i) => ({ group, weight: weights[position][i], score: values[i] }));
    const missing = applicable.filter(x => x.weight > 0 && x.score === null).map(x => x.group);
    const available = applicable.filter(x => x.weight > 0 && x.score !== null);
    const totalWeight = available.reduce((sum, x) => sum + x.weight, 0);
    const total = totalWeight ? available.reduce((sum, x) => sum + x.score! * x.weight, 0) / totalWeight : null;
    const band = total === null ? null : total < 50 ? "เตือน" : total < 90 ? "ผ่าน" : "incentive";
    return { person, position, groups: applicable, missing, total, band, trial: period < "2027-01", warning: period >= "2027-01" && band === "เตือน" };
  });
}
