import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSkillStatus, radarPoint, radarPolygon } from "../lib/skill-status.ts";

describe("skill status", () => {
  it("splits 7 hard / 8 soft and starts everyone at level 1", () => {
    const status = buildSkillStatus(undefined);
    assert.equal(status.hard.items.length, 7);
    assert.equal(status.soft.items.length, 8);
    assert.equal(status.hasData, false);
    assert.equal(status.hard.average, 1);
    assert.equal(status.soft.average, 1);
    assert.ok([...status.hard.items, ...status.soft.items].every((item) => item.level === 1));
    assert.equal(status.hard.maxLevel, 4);
    assert.equal(status.soft.maxLevel, 3);
  });

  it("averages confirmed levels and clamps to the group max", () => {
    const status = buildSkillStatus({
      staffCode: "Boom",
      levels: { cashier: { level: 3, since: "2026-10-01" }, weekly_event: { level: 2, since: "2026-10-01" }, service: { level: 9, since: "2026-10-01" } },
      history: [],
      updatedAt: "2026-11-04T00:00:00Z"
    });
    assert.equal(status.hasData, true);
    assert.equal(status.hard.average, 1.4); // (3+2+1×5)/7
    assert.equal(status.soft.items.find((item) => item.id === "service")?.level, 3);
  });

  it("never shows a level below the start level", () => {
    const status = buildSkillStatus({ staffCode: "Boom", levels: { stock: { level: 0, since: "2026-10-01" } }, history: [], updatedAt: "" });
    assert.equal(status.hard.items.find((item) => item.id === "stock")?.level, 1);
  });

  it("puts the first axis straight up", () => {
    assert.deepEqual(radarPoint(0, 7, 100, 200, 200), { x: 200, y: 100 });
    assert.equal(radarPolygon([4, 0, 0, 0], 4, 100, 0, 0).split(" ")[0], "0,-100");
  });
});
