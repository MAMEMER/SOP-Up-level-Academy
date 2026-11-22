import { test } from "node:test";
import { strict as assert } from "node:assert";
import { calculateKpiV2 } from "../lib/kpi-v2-score.ts";
import { peerReviewItems, type PeerReviewRecord } from "../lib/peer-review.ts";
import type { MistakeRecord } from "../lib/mistake-log.ts";

const person = { code: "A", branch: "one", position: "regular" as const, numbers: { advanced: 100, revenueOwn: 100 } };
const review = (raterCode: string, period = "2027-01"): PeerReviewRecord => ({ id: raterCode, period, raterCode, rateeCode: "A", ratings: Object.fromEntries(peerReviewItems.map(i => [i.id, 4])), examples: {} } as PeerReviewRecord);
const reviews = [review("X"), review("Y")];
const score = (row: ReturnType<typeof calculateKpiV2>[number], group: string) => row.groups.find(g => g.group === group)!.score;

test("position weights sum to 100", () => {
  for (const position of ["temporary", "regular", "branch_manager"] as const) {
    const [row] = calculateKpiV2("2027-01", [{ ...person, position }], [], []);
    assert.equal(row.groups.reduce((sum, g) => sum + g.weight, 0), 100);
  }
});

test("missing scores are excluded and revenue halves are reported separately", () => {
  const [row] = calculateKpiV2("2027-01", [{ ...person, numbers: { revenueOwn: 60 } }], [], []);
  assert.equal(score(row, "revenue"), 60);
  assert.deepEqual(row.missing, ["advanced", "team", "revenueStore"]);
  assert.ok(Math.abs(row.total! - (100 * 25 + 60 * 35) / 60) < 1e-9);
  const [storeOnly] = calculateKpiV2("2027-01", [{ ...person, numbers: {} }], [], [], { store: 90 });
  assert.equal(score(storeOnly, "revenue"), 90);
  assert.ok(storeOnly.missing.includes("revenueOwn"));
  const [neither] = calculateKpiV2("2027-01", [{ ...person, numbers: {} }], [], []);
  assert.equal(score(neither, "revenue"), null);
  assert.ok(neither.missing.includes("revenueOwn") && neither.missing.includes("revenueStore"));
});

test("store gate uses the relevant store half and caps only when necessary", () => {
  const run = (store?: number) => calculateKpiV2("2027-01", [person], [], reviews, { store })[0];
  assert.equal(run(89).total, 89.9);
  assert.equal(run(89).capped, true);
  assert.equal(run(90).band, "incentive");
  assert.equal(run().capped, false);
  assert.equal(run(0).capped, false);
  const [manager] = calculateKpiV2("2027-01", [{ ...person, position: "branch_manager" }], [], reviews, { store: 100, byBranch: { one: 80 } });
  assert.equal(score(manager, "revenue"), 90);
  assert.equal(manager.capped, true);
});

test("basic averages both mistake groups and gates incentive", () => {
  const mistake = { staffCode: "A", taskCode: "1.1.1", level: "intentional", date: "2027-01-03", createdAt: "2027-01-03T00:00:00Z", id: "m" } as MistakeRecord;
  const [row] = calculateKpiV2("2027-01", [person], [mistake], reviews, { store: 100 });
  assert.equal(score(row, "basic"), 50);
  assert.equal(row.incentiveEligible, false);
  const [weighted] = calculateKpiV2("2027-01", [{ ...person, position: "branch_manager" }], [mistake], reviews, { store: 100 });
  assert.ok(weighted.total! >= 90);
  assert.equal(weighted.band, "ผ่าน");
  const voided = { ...mistake, decision: { result: "voided" } } as MistakeRecord;
  assert.equal(score(calculateKpiV2("2027-01", [person], [voided], reviews)[0], "basic"), 100);
  assert.equal(score(calculateKpiV2("2027-01", [person], [], [review("X")])[0], "team"), null);
});

test("trial months do not issue warnings", () => {
  const mistake = { staffCode: "A", taskCode: "1.1.1", level: "intentional", date: "2026-12-03", createdAt: "2026-12-03T00:00:00Z", id: "m" } as MistakeRecord;
  const [row] = calculateKpiV2("2026-12", [{ ...person, numbers: { advanced: 0, revenueOwn: 0 } }], [mistake], [], { store: 0 });
  assert.equal(row.band, "เตือน");
  assert.equal(row.trial, true);
  assert.equal(row.warning, false);
});
