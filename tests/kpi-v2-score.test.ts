import { test } from "node:test";
import { strict as assert } from "node:assert";
import { calculateKpiV2 } from "../lib/kpi-v2-score.ts";
import { peerReviewItems, type PeerReviewRecord } from "../lib/peer-review.ts";
import type { MistakeRecord } from "../lib/mistake-log.ts";

const people = [{ code: "A", branch: "one", position: "regular" as const, numbers: { group12: 80, group22: 60 } }, { code: "B", branch: "two", position: "temporary" as const, numbers: { group12: 40, group22: 0 } }];
const review = (raterCode: string): PeerReviewRecord => ({ id: raterCode, period: "2027-01", raterCode, rateeCode: "A", ratings: Object.fromEntries(peerReviewItems.map(i => [i.id, 4])), examples: {} } as PeerReviewRecord);

test("weights, team average and branch scope", () => {
  const [a, b] = calculateKpiV2("2027-01", people, [], [review("X"), review("Y")], { group4: 50 });
  assert.equal(a.groups.find(g => g.group === "3")?.score, 96);
  assert.ok(Math.abs(a.total! - 82.9) < 1e-8);
  assert.equal(b.groups.find(g => g.group === "2.2")?.weight, 0);
  assert.ok(b.missing.includes("3"));
  const manager = calculateKpiV2("2027-01", [{ ...people[0], position: "branch_manager" }, people[1]], [], [review("X"), review("Y")], { group4: 50 })[0];
  assert.equal(manager.groups.find(g => g.group === "3")?.score, 97);
});

test("missing data is excluded and trial warnings never count", () => {
  const [row] = calculateKpiV2("2026-12", [{ code: "A", branch: "one" }], [], []);
  assert.deepEqual(row.missing, ["1.2", "2.2", "3", "4"]);
  assert.equal(row.total, 100);
  assert.equal(row.trial, true);
  assert.equal(row.warning, false);
});

test("mistake deductions reuse appeal handling and escalation", () => {
  const base = { staffCode: "A", taskCode: "1.1.1", level: "intentional", date: "2027-01-03", createdAt: "2027-01-03T00:00:00Z" };
  const mistake = { ...base, id: "m" } as MistakeRecord;
  assert.equal(calculateKpiV2("2027-01", people, [mistake], [])[0].groups[0].score, 0);
  const voided = { ...mistake, decision: { result: "voided" } } as MistakeRecord;
  assert.equal(calculateKpiV2("2027-01", people, [voided], [])[0].groups[0].score, 100);
  assert.equal(calculateKpiV2("2027-01", people, [], [review("X")])[0].groups[4].score, null);
});
