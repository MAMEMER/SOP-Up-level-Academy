import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  evaluateSkill,
  mondayOf,
  periodStartOf,
  periodWorkDays,
  reviewDeadline,
  reviewPeriodFor,
  type SkillWeekEntry,
  type SkillWeekResult
} from "../lib/skill-progress.ts";
import { confirmSkillResult, mergeSkillReview, setSkillLevel, skillEntriesFor } from "../lib/skill-reviews.ts";
import { skillIndicators } from "../lib/skill-indicators.ts";

const START = "2026-08-31"; // วันเริ่มรอบ (ตรงกับ PERIOD_ANCHOR 2026-10-26 ย้อนไป 4 รอบ)

/** ผลต่อเนื่องรายรอบ (ทุก 2 สัปดาห์) เริ่มจาก START */
function rounds(results: SkillWeekResult[], extra: Partial<SkillWeekEntry> = {}): SkillWeekEntry[] {
  return results.map((result, index) => ({ weekStart: addDays(START, index * 14), result, ...extra }));
}

function lastRound(entries: SkillWeekEntry[]) {
  return entries[entries.length - 1].weekStart;
}

const base = { highRisk: false, maxLevel: 4 };

describe("period helpers (ประเมินทุก 2 สัปดาห์)", () => {
  it("finds the Monday, the start of the 2-week round, and the round to review", () => {
    assert.equal(mondayOf("2026-11-04"), "2026-11-02");
    assert.equal(periodStartOf("2026-10-26"), "2026-10-26");
    assert.equal(periodStartOf("2026-11-04"), "2026-10-26"); // สัปดาห์ที่ 2 ของรอบ
    assert.equal(periodStartOf("2026-11-08"), "2026-10-26"); // อาทิตย์สุดท้ายของรอบ
    assert.equal(periodStartOf("2026-11-09"), "2026-11-09");
    assert.equal(periodStartOf("2026-10-25"), "2026-10-12");
    assert.equal(reviewPeriodFor("2026-11-09"), "2026-10-26");
    assert.equal(reviewPeriodFor("2026-11-17"), "2026-10-26");
  });

  it("deadline is the Wednesday after the 2-week round (within 3 days of Monday)", () => {
    assert.equal(reviewDeadline("2026-10-26"), "2026-11-11");
  });

  it("counts work days as rostered ∩ clocked in, across both weeks of the round only", () => {
    const schedules = [
      { employeeName: "ICE", workDate: "2026-10-26" },
      { employeeName: "ICE", workDate: "2026-11-03" }, // สัปดาห์ที่ 2 ของรอบ
      { employeeName: "ICE", workDate: "2026-11-09" }, // รอบถัดไป
      { employeeName: "Leo", workDate: "2026-10-26" }
    ];
    const clock = [
      { employeeName: "ICE", workDate: "2026-10-26" },
      { employeeName: "ICE", workDate: "2026-11-03" },
      { employeeName: "ICE", workDate: "2026-11-09" }
    ];
    assert.deepEqual(periodWorkDays("2026-10-26", "ICE", schedules, clock), { planned: 2, worked: 2 });
  });
});

describe("evaluateSkill — ขึ้นระดับ", () => {
  it("level 1 → 2 needs 2 'next' rounds within the last 3 rounds (6 weeks)", () => {
    const one = rounds(["next", "hold"]);
    assert.equal(evaluateSkill({ ...base, entries: one, level: 1, asOf: lastRound(one) }).suggestion.kind, "none");
    const two = rounds(["next", "hold", "next"]);
    const result = evaluateSkill({ ...base, entries: two, level: 1, asOf: lastRound(two) });
    assert.equal(result.suggestion.kind, "promote");
    assert.equal(result.have, 2);
  });

  it("rounds older than the 3-round window do not count", () => {
    const entries = rounds(["next", "hold", "hold", "next"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 1, asOf: lastRound(entries) }).suggestion.kind, "none");
  });

  it("high-risk needs 2 consecutive confirmed rounds; 'na' does not break the run", () => {
    const risky = { highRisk: true, maxLevel: 4 };
    const unconfirmed = rounds(["next", "next"]);
    assert.equal(evaluateSkill({ ...risky, entries: unconfirmed, level: 1, asOf: lastRound(unconfirmed) }).suggestion.kind, "none");

    const withGap = rounds(["next", "na", "next"], { confirmed: true });
    assert.equal(evaluateSkill({ ...risky, entries: withGap, level: 1, asOf: lastRound(withGap) }).suggestion.kind, "promote");

    const broken = rounds(["next", "next", "hold", "next"], { confirmed: true });
    const result = evaluateSkill({ ...risky, entries: broken, level: 1, asOf: lastRound(broken) });
    assert.equal(result.suggestion.kind, "none");
    assert.equal(result.have, 1);
  });

  it("only rounds since the current level started are counted", () => {
    const entries = rounds(["next", "next", "hold"]);
    const since = addDays(START, 14 * 2 + 3); // กลางรอบที่ 3
    assert.equal(evaluateSkill({ ...base, entries, level: 1, levelSince: since, asOf: lastRound(entries) }).suggestion.kind, "none");
  });

  it("level 2 → 3 needs 4 of 5 rounds, ≥ 2 rounds at level, and no serious error in 4 rounds", () => {
    const four = rounds(["next", "next", "hold", "next", "next"]);
    assert.equal(evaluateSkill({ ...base, entries: four, level: 2, levelSince: START, asOf: lastRound(four) }).suggestion.kind, "promote");

    const serious = four.map((entry, index) => (index === 3 ? { ...entry, serious: true } : entry));
    assert.equal(evaluateSkill({ ...base, entries: serious, level: 2, levelSince: START, asOf: lastRound(serious) }).suggestion.kind, "none");
  });

  it("level 3 → 4 needs 6 rounds (12 weeks) at level 3", () => {
    const five = rounds(["hold", "hold", "hold", "hold", "hold"]);
    assert.equal(evaluateSkill({ ...base, entries: five, level: 3, levelSince: START, asOf: lastRound(five) }).suggestion.kind, "none");
    const six = rounds(["hold", "hold", "hold", "hold", "hold", "hold"]);
    assert.equal(evaluateSkill({ ...base, entries: six, level: 3, levelSince: START, asOf: lastRound(six) }).suggestion.kind, "promote");
  });

  it("soft skills stop at level 3", () => {
    const entries = rounds(["next"]);
    const result = evaluateSkill({ entries, level: 3, highRisk: false, maxLevel: 3, asOf: lastRound(entries) });
    assert.equal(result.target, null);
  });
});

describe("evaluateSkill — ลด / ทบทวน / ระงับ", () => {
  it("2 consecutive 'below' rounds → demote (na in between still consecutive)", () => {
    const entries = rounds(["hold", "below", "na", "below"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastRound(entries) }).suggestion.kind, "demote");
  });

  it("2 'below' within the last 3 rounds → demote; 1 does not", () => {
    const entries = rounds(["below", "hold", "below"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastRound(entries) }).suggestion.kind, "demote");
    const once = rounds(["below", "hold", "hold", "below"]);
    assert.equal(evaluateSkill({ ...base, entries: once, level: 2, asOf: lastRound(once) }).suggestion.kind, "none");
  });

  it("more than 2 rounds (4 weeks) of 'na' → needs review", () => {
    const entries = rounds(["hold", "na", "na", "na"]);
    assert.equal(evaluateSkill({ ...base, entries, level: 2, asOf: lastRound(entries) }).suggestion.kind, "review");
    const two = rounds(["hold", "na", "na"]);
    assert.equal(evaluateSkill({ ...base, entries: two, level: 2, asOf: lastRound(two) }).suggestion.kind, "none");
  });

  it("a serious error this round → suspend, ahead of everything else", () => {
    const entries = rounds(["next", "next"]);
    entries[1] = { ...entries[1], serious: true };
    assert.equal(evaluateSkill({ ...base, entries, level: 1, asOf: lastRound(entries) }).suggestion.kind, "suspend");
  });

  it("level 0 is never demoted", () => {
    const entries = rounds(["below", "below"]);
    assert.notEqual(evaluateSkill({ ...base, entries, level: 0, asOf: lastRound(entries) }).suggestion.kind, "demote");
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
