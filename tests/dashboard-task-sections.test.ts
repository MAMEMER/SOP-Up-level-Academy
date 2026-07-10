import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("dashboard task sections UI", () => {
  it("does not show redundant header action buttons for daily and stock sections", () => {
    const source = readFileSync(new URL("../components/DashboardTaskSections.tsx", import.meta.url), "utf8");

    assert.equal(source.includes(">เปิด Checklist<"), false);
    assert.equal(source.includes(">เปิด Stock<"), false);
  });
});
