import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  evaluateSkill,
  mondayOf,
  reviewDeadline,
  reviewWeekFor,
  weekWorkDays,
  type SkillWeekEntry,
  type SkillWeekResult
} from "../lib/skill-progress.ts";
import { confirmSkillResult, mergeSkillReview, setSkillLevel, skillEntriesFor } from "../lib/skill-reviews.ts";
import { skillIndicators } from "../lib/skill-indicators.ts";

const START = "2026-09-07"; // วันจันทร์

/** ผลต่อเนื่องรายสัปดาห์ เริ่มจาก START */
function weeks(results: SkillWeekResult[], extra: Partial<SkillWeekEntry> = {}): SkillWeekEntry[] {
  return results.map((result, index) => ({ weekStart: addDays(START, index * 7), result, ...extra }));
}

function lastWeek(entries: SkillWeekEntry[]) {
  return entries[entries.length - 1].weekStart;
}

const base = { highRisk: false, maxLevel: 4 };

describe("week helpers", () => {
  it("finds the Monday of any day and the week to review", () => {
    assert.equal(mondayOf("2026-11-04"), "2026-11-02"); // พุธ → จันทร์
    assert.equal(mondayOf("2026-11-08"), "2026-11-02"); // อาทิตย์ → จันทร์ก่อนหน้า
    assert.equal(mondayOf("2026-11-02"), "2026-11-02");
    assert.equal(reviewWeekFor("2026-11-02"), "2026-10-26");
  });

  it("deadline is the Wednesday after the reviewed week (within 3 days of Monday)", () => {
    assert.equal(reviewDeadline("2026-10-26"), "2026-11-04");
  });

  it("counts work days as rostered ∩ clocked in, within the week only", () => {
    const schedules = [
      { employeeName: "ICE", workDate: "2026-10-26" },
      { employeeName: "ICE", workDate: "2026-10-27" },
      { employeeName: "ICE", workDate: "2026-11-02" }, // สัปดาห์ถัดไป
      { employeeName: "Leo", workDate: "2026-10-26" }
    ];
    const clock = [{ employeeName: "ICE", workDate: "2026-10-26" }, { employeeName: "ICE", workDate: "2026-11-02" }];
    assert.deepEqual(weekWorkDays("2026-10-26", "ICE", schedules, clock), { planned: 2, worked: 1 });
  });
});

describe("evaluateSkill — ขึ้นระดับ", () => {
  it("level 1 → 2 needs 4 'next' within the last 6 weeks", () => {
    const three = weeks(["next", "hold", "next", "next"]);
    assert.equal(evaluateSkill({ ...base, entries: three, level: 1, asOf: lastWeek(three) }).suggestion.kind, "none");
    const four = weeks(["next", "hold", "next", "next", "hold", "next"]);
    const result = evaluateSkill({ ...base, entries: four, level: 1, asOf: lastWeek(four) });
    assert.equal(result.suggestion.kind, "promote");
    assert.equal(result.have, 4);
  });

  it("weeks older than the 6-week window do not count", () => {
    const entries = weeks(["next", "next", "hold", "hold", "hold", "hold", "next", "next"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 1, asOf: lastWeek(entries) }).suggestion.kind, "none");
  });

  it("high-risk needs 4 consecutive confirmed weeks; 'na' does not break the run", () => {
    const risky = { highRisk: true, maxLevel: 4 };
    const unconfirmed = weeks(["next", "next", "next", "next"]);
    assert.equal(evaluateSkill({ ...risky, entries: unconfirmed, level: 1, asOf: lastWeek(unconfirmed) }).suggestion.kind, "none");

    const withGap = weeks(["next", "na", "next", "next", "next"], { confirmed: true });
    assert.equal(evaluateSkill({ ...risky, entries: withGap, level: 1, asOf: lastWeek(withGap) }).suggestion.kind, "promote");

    const broken = weeks(["next", "next", "hold", "next", "next"], { confirmed: true });
    const result = evaluateSkill({ ...risky, entries: broken, level: 1, asOf: lastWeek(broken) });
    assert.equal(result.suggestion.kind, "none");
    assert.equal(result.have, 2);
  });

  it("only weeks since the current level started are counted", () => {
    const entries = weeks(["next", "next", "next", "next", "hold"]);
    const since = addDays(START, 7 * 3);
    assert.equal(evaluateSkill({ ...base, entries, level: 1, levelSince: since, asOf: lastWeek(entries) }).suggestion.kind, "none");
  });

  it("level 2 → 3 needs 8 of 10, ≥ 4 weeks at level, and no serious error in 8 weeks", () => {
    const eight = weeks(["next", "next", "hold", "next", "next", "next", "next", "hold", "next", "next"]);
    assert.equal(evaluateSkill({ ...base, entries: eight, level: 2, levelSince: START, asOf: lastWeek(eight) }).suggestion.kind, "promote");

    const serious = eight.map((entry, index) => (index === 3 ? { ...entry, serious: true } : entry));
    assert.equal(evaluateSkill({ ...base, entries: serious, level: 2, levelSince: START, asOf: lastWeek(serious) }).suggestion.kind, "none");
  });

  it("soft skills stop at level 3", () => {
    const entries = weeks(["next"]);
    const result = evaluateSkill({ entries, level: 3, highRisk: false, maxLevel: 3, asOf: lastWeek(entries) });
    assert.equal(result.target, null);
  });
});

describe("evaluateSkill — ลด / ทบทวน / ระงับ", () => {
  it("2 consecutive 'below' → demote (na in between still consecutive)", () => {
    const entries = weeks(["hold", "below", "na", "below"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastWeek(entries) }).suggestion.kind, "demote");
  });

  it("3 'below' within 6 weeks → demote", () => {
    const entries = weeks(["below", "hold", "below", "hold", "below", "hold"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastWeek(entries) }).suggestion.kind, "demote");
  });

  it("more than 4 weeks of 'na' → needs review", () => {
    const entries = weeks(["hold", "na", "na", "na", "na", "na"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastWeek(entries) }).suggestion.kind, "review");
    const four = weeks(["hold", "na", "na", "na", "na"]);
    assert.equal(evaluateSkill({ ...base, entries: four, level: 2, asOf: lastWeek(four) }).suggestion.kind, "none");
  });

  it("a serious error this week → suspend, ahead of everything else", () => {
    const entries = weeks(["next", "next", "next", "next"]);
    entries[3] = { ...entries[3], serious: true };
    assert.equal(evaluateSkill({ ...base, entries, level: 1, asOf: lastWeek(entries) }).suggestion.kind, "suspend");
  });

  it("level 0 is never demoted", () => {
    const entries = weeks(["below", "below"]);
    assert.notEqual(evaluateSkill({ ...base, entries, level: 0, asOf: lastWeek(entries) }).suggestion.kind, "demote");
  });
});

describe("skill review records", () => {
  const at = "2026-11-02T03:00:00.000Z";
  const input = (result: string, note = "ok") => ({
    weekStart: "2026-10-26",
    staffCode: "ICE",
    rows: [{ indicatorId: "cashier", result, note, serious: false }],
    by: "namenrw@gmail.com",
    at
  });

  it("ignores unknown indicators and invalid results", () => {
    const record = mergeSkillReview(undefined, {
      ...input("next"),
      rows: [
        { indicatorId: "nope", result: "next", note: "", serious: false },
        { indicatorId: "stock", result: "great", note: "", serious: false }
      ]
    });
    assert.deepEqual(record.results, {});
  });

  it("a second reviewer confirms a high-risk result; the same person cannot", () => {
    const record = mergeSkillReview(undefined, input("next"));
    assert.equal(confirmSkillResult(record, "cashier", "namenrw@gmail.com", at), null);
    const confirmed = confirmSkillResult(record, "cashier", "champ.championest@gmail.com", at);
    assert.equal(confirmed?.results.cashier.confirmedBy, "champ.championest@gmail.com");
    assert.equal(skillEntriesFor([confirmed!], "ICE", "cashier")[0].confirmed, true);

    // ผลไม่เปลี่ยน → การยืนยันยังอยู่
    const resaved = mergeSkillReview(confirmed!, input("next"));
    assert.equal(resaved.results.cashier.confirmedBy, "champ.championest@gmail.com");
    // ผลเปลี่ยน → ล้างการยืนยันและเก็บประวัติ
    const changed = mergeSkillReview(confirmed!, input("hold"));
    assert.equal(changed.results.cashier.confirmedBy, undefined);
    assert.deepEqual(changed.edits.map((edit) => [edit.from, edit.to]), [["next", "hold"]]);
  });

  it("setting a level appends history and clamps to the max level", () => {
    const first = setSkillLevel(undefined, {
      staffCode: "ICE",
      indicatorId: "service",
      level: 9,
      date: "2026-11-02",
      reason: "ระดับตั้งต้น",
      by: "namenrw@gmail.com",
      at
    });
    assert.equal(first?.levels.service.level, 3); // soft skill สูงสุด 3
    const same = setSkillLevel(first!, { staffCode: "ICE", indicatorId: "service", level: 3, date: "2026-11-03", reason: "x", by: "a", at });
    assert.equal(same, null);
    const down = setSkillLevel(first!, { staffCode: "ICE", indicatorId: "service", level: 2, date: "2026-11-09", reason: "ต่ำกว่าระดับ 2 สัปดาห์", by: "a", at });
    assert.equal(down?.history.length, 2);
    assert.deepEqual(down?.history.map((h) => [h.from, h.to]), [[0, 3], [3, 2]]);
  });

  it("has the 15 indicators from the Career Path (7 hard + 8 soft)", () => {
    assert.equal(skillIndicators.filter((i) => i.group === "hard").length, 7);
    assert.equal(skillIndicators.filter((i) => i.group === "soft").length, 8);
    assert.deepEqual(
      skillIndicators.filter((i) => i.highRisk).map((i) => i.id),
      ["cashier", "honesty"]
    );
  });
});
