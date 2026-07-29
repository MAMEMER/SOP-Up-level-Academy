import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStockCheckRecord, stockCheckRecordsToCounts } from "../lib/stock-check-records.ts";
import { calculateStockScore } from "../lib/performance-score.ts";

const entry = (over: Partial<Parameters<typeof buildStockCheckRecord>[0]> = {}) =>
  buildStockCheckRecord(
    {
      workDate: "2026-08-05",
      employeeName: "ICE",
      countType: "weekly",
      category: "Sleeve",
      result: "matched",
      slowCount: false,
      note: "",
      recordedBy: "champ.championest@gmail.com",
      ...over
    },
    "2026-08-05T12:00:00.000Z"
  );

describe("owner-entered stock checks", () => {
  it("costs nothing when the count matched StoreHub", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry()]));

    assert.equal(result.score, 20);
    assert.equal(result.deductions.length, 0);
  });

  it("costs nothing when a mismatch was resolved within 24 hours", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry({ result: "resolved" })]));

    assert.equal(result.score, 20);
  });

  it("charges 10 for a count that was never done", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry({ result: "not_counted" })]));

    assert.equal(result.score, 10);
    assert.equal(result.deductions[0].reason, "stock_not_counted");
  });

  it("charges a real shortfall once the grace period has passed", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry({ result: "real_loss" })]));

    assert.equal(result.score, 18);
    assert.equal(result.deductions[0].reason, "stock_difference");
  });

  it("charges 2 more when the owner marks the count as slow", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry({ slowCount: true })]));

    assert.equal(result.score, 18);
    assert.equal(result.deductions[0].reason, "stock_slow_count");
  });

  it("flags a count sent for review without deducting automatically", () => {
    const result = calculateStockScore(stockCheckRecordsToCounts([entry({ result: "fraud_review" })]));

    assert.equal(result.score, 20);
    assert.ok(result.flags.includes("management_review_required"));
  });

  it("names a category when the owner leaves it blank", () => {
    assert.equal(entry({ category: "" }).category, "อุปกรณ์ / Sleeve");
    assert.equal(entry({ category: "", countType: "monthly" }).category, "Single card");
  });

  it("attributes the count to the staff member the owner picked", () => {
    const [count] = stockCheckRecordsToCounts([entry({ employeeName: "Boom" })]);

    assert.equal(count.employeeName, "Boom");
    assert.equal(count.owner, "Boom");
    assert.equal(count.source, "manual");
  });
});
