import { test } from "node:test";
import { strict as assert } from "node:assert";
import { calculateKpiV2 } from "../lib/kpi-v2-score.ts";
import { peerReviewItems, type PeerReviewRecord } from "../lib/peer-review.ts";
import type { MistakeRecord } from "../lib/mistake-log.ts";

const people = [{ code: "A", branch: "one", position: "regular" as const, numbers: { group12: 80, group22: 60 } }, { code: "B", branch: "two", position: "temporary" as const, numbers: { group12: 40, group22: 0 } }];
const review = (raterCode: string): PeerReviewRecord => ({ id: raterCode, period: "2027-01", raterCode, rateeCode: "A", ratings: Object.fromEntries(peerReviewItems.map(i => [i.id, 4])), examples: {} } as PeerReviewRecord);

test("weights, team average and branch scope", () => {
  const [a, b] = calculateKpiV2("2027-01", people, [], [review("X"), review("Y")], { group4: 50 });
  assert.ok(Math.abs(a.groups.find(g => g.group === "3")!.score! - 96) < 1e-9);
  assert.ok(Math.abs(a.total! - 74.4) < 1e-8);
  assert.equal(b.groups.find(g => g.group === "2.2")?.weight, 0);
  assert.ok(b.missing.includes("3"));
  const manager = calculateKpiV2("2027-01", [{ ...people[0], position: "branch_manager" }, people[1]], [], [review("X"), review("Y")], { group4: 50 })[0];
  assert.ok(Math.abs(manager.groups.find(g => g.group === "3")!.score! - 97) < 1e-9);
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

test("team score works before advanced numbers exist", () => {
  const rev = (r: string) => ({ ...review(r), period: "2026-12" });
  const [row] = calculateKpiV2("2026-12", [{ code: "A", branch: "one", position: "temporary" }], [], [rev("X"), rev("Y")]);
  assert.ok(Math.abs(row.groups.find(g => g.group === "3")!.score! - 100) < 1e-9);
  assert.ok(!row.missing.includes("3"));
});


test("position weights add to 100", () => {
  for (const position of ["temporary", "regular", "branch_manager"] as const) {
    const [row] = calculateKpiV2("2027-01", [{ code: "A", branch: "one", position }], [], []);
    assert.equal(row.groups.reduce((sum, group) => sum + group.weight, 0), 100);
  }
});

test("store score caps the total only when it would exceed 89.9", () => {
  const person = { code: "A", branch: "one", position: "regular" as const, numbers: { group12: 100, group22: 100 } };
  const run = (group4?: number) => calculateKpiV2("2027-01", [person], [], [review("X"), review("Y")], { group4 })[0];
  const capped = run(89.9);
  assert.equal(capped.total, 89.9);
  assert.equal(capped.capped, true);
  assert.equal(capped.band, "ผ่าน");
  const atTarget = run(90);
  assert.equal(atTarget.capped, false);
  assert.equal(atTarget.band, "incentive");
  const missing = run();
  assert.equal(missing.capped, false);
  assert.equal(missing.total, 100);
  assert.ok(missing.missing.includes("4"));
  const belowCap = run(50);
  assert.equal(belowCap.capped, false);
});
