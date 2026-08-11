import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendApproval,
  buildStockRun,
  canSubmitStockRun,
  defaultPeriodLabel,
  hasDiscrepancy,
  isoWeekLabel,
  isStockRunActionable,
  isStockRunReviewable,
  lineDiff,
  meaningfulCountLines,
  monthLabel,
  sortStockRunsNewestFirst,
  submitBlockReason,
  type StockCountLine,
  type StockRun
} from "../lib/stock-runs.ts";

const snapshot = { title: "Stock อุปกรณ์ / Sleeve", items: ["ดึงข้อมูลระบบ", "นับจริง"] };

function newRun(): StockRun {
  return buildStockRun({
    id: "sr__weekly__NN__x",
    kind: "weekly",
    branch: "bangkae",
    staffCode: "NN",
    assignedBy: "champ@example.com",
    periodLabel: "2026-W32",
    dueDate: "2026-08-15",
    checklist: snapshot,
    createdAt: "2026-08-11T03:00:00.000Z"
  });
}

describe("stock run — new run defaults + snapshot", () => {
  it("starts as assigned with an isolated checklist snapshot", () => {
    const run = newRun();
    assert.equal(run.status, "assigned");
    assert.equal(run.dueDate, "2026-08-15");
    assert.deepEqual(run.checklist.items, ["ดึงข้อมูลระบบ", "นับจริง"]);
    assert.deepEqual(run.counts, []);
    assert.deepEqual(run.approvals, []);
    assert.equal(run.startedAt, "");
    assert.equal(run.submittedAt, "");
  });

  it("copies the snapshot array so later edits to the source do not mutate history", () => {
    const source = { title: "T", items: ["a", "b"] };
    const run = buildStockRun({
      id: "id",
      kind: "monthly",
      branch: "bangkae",
      staffCode: "PW",
      assignedBy: "a@b.c",
      periodLabel: "2026-08",
      checklist: source,
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    source.items.push("c");
    assert.deepEqual(run.checklist.items, ["a", "b"]);
    assert.equal(run.dueDate, "");
  });
});

describe("stock run — count diff + discrepancy", () => {
  it("computes diff only when both numbers are present", () => {
    assert.equal(lineDiff({ name: "Sleeve", system: 20, counted: 18 }), -2);
    assert.equal(lineDiff({ name: "Sleeve", system: 20, counted: 20 }), 0);
    assert.equal(lineDiff({ name: "Sleeve", system: null, counted: 18 }), null);
    assert.equal(lineDiff({ name: "Sleeve", system: 20, counted: null }), null);
  });

  it("ignores blank rows when detecting discrepancies", () => {
    const counts: StockCountLine[] = [
      { name: "", system: 1, counted: 99 }, // blank name → ignored
      { name: "Deck box", system: 5, counted: 5 }
    ];
    assert.equal(hasDiscrepancy(counts), false);
    assert.equal(meaningfulCountLines(counts).length, 1);
    counts.push({ name: "Sleeve", system: 20, counted: 18 });
    assert.equal(hasDiscrepancy(counts), true);
  });
});

describe("stock run — submit gate", () => {
  it("requires at least one counted line AND evidence", () => {
    const run = newRun();
    assert.equal(canSubmitStockRun(run), false);
    assert.match(submitBlockReason(run), /รายการนับ/);

    run.counts = [{ name: "Sleeve", system: 20, counted: 18 }];
    assert.equal(canSubmitStockRun(run), false);
    assert.match(submitBlockReason(run), /หลักฐาน/);

    run.evidence = ["https://example.com/proof.jpg"];
    assert.equal(canSubmitStockRun(run), true);
    assert.equal(submitBlockReason(run), "");
  });

  it("does not accept a named line without a counted number", () => {
    const run = newRun();
    run.counts = [{ name: "Sleeve", system: 20, counted: null }];
    run.evidence = ["https://example.com/proof.jpg"];
    assert.equal(canSubmitStockRun(run), false);
  });
});

describe("stock run — status transitions + approval history", () => {
  it("marks the right statuses actionable / reviewable", () => {
    assert.equal(isStockRunActionable("assigned"), true);
    assert.equal(isStockRunActionable("in_progress"), true);
    assert.equal(isStockRunActionable("needs_revision"), true);
    assert.equal(isStockRunActionable("submitted"), false);
    assert.equal(isStockRunActionable("approved"), false);

    assert.equal(isStockRunReviewable("submitted"), true);
    assert.equal(isStockRunReviewable("approved"), false);
  });

  it("appends approval entries immutably", () => {
    const run = newRun();
    const first = appendApproval(run.approvals, {
      by: "champ@example.com",
      status: "needs_revision",
      note: "นับ Sleeve ใหม่",
      at: "2026-08-11T04:00:00.000Z"
    });
    const second = appendApproval(first, {
      by: "champ@example.com",
      status: "approved",
      note: "",
      at: "2026-08-11T05:00:00.000Z"
    });
    assert.equal(run.approvals.length, 0); // original untouched
    assert.equal(first.length, 1);
    assert.equal(second.length, 2);
    assert.equal(second[1].status, "approved");
  });
});

describe("stock run — period labels + sorting", () => {
  it("builds ISO week + month labels", () => {
    // 2026-08-11 is a Tuesday → ISO week 33
    const d = new Date("2026-08-11T06:00:00.000Z");
    assert.equal(isoWeekLabel(d), "2026-W33");
    assert.equal(monthLabel(d), "2026-08");
    assert.equal(defaultPeriodLabel("weekly", d), "2026-W33");
    assert.equal(defaultPeriodLabel("monthly", d), "2026-08");
  });

  it("sorts newest run first", () => {
    const a = newRun();
    a.id = "a";
    a.createdAt = "2026-08-01T00:00:00.000Z";
    const b = newRun();
    b.id = "b";
    b.createdAt = "2026-08-10T00:00:00.000Z";
    const sorted = sortStockRunsNewestFirst([a, b]);
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["b", "a"]
    );
  });
});
