import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoWeekKey } from "../lib/periodic-tasks.ts";
import { weeklyEventPeriodKey } from "../lib/weekly-event-store.ts";

// Regression: Lorcana (and any event that runs several days in one week) must get a
// fresh checklist EACH event day. It used to be keyed by ISO week, so a checklist
// filled on Fri 2026-07-31 still showed on Sun 2026-08-02 (same ISO week) and never reset.
describe("weekly event checklist resets per event day, not per ISO week", () => {
  it("gives each work date its own period key", () => {
    assert.equal(weeklyEventPeriodKey("2026-07-31"), "2026-07-31");
    assert.equal(weeklyEventPeriodKey("2026-08-02"), "2026-08-02");
  });

  it("Fri and Sun of the SAME ISO week no longer share a checklist", () => {
    const friday = "2026-07-31";
    const sunday = "2026-08-02";
    // Both fall in the same ISO week …
    assert.equal(isoWeekKey(friday), isoWeekKey(sunday));
    // … but their checklist period keys must differ so Sunday starts fresh.
    assert.notEqual(weeklyEventPeriodKey(friday), weeklyEventPeriodKey(sunday));
  });
});
