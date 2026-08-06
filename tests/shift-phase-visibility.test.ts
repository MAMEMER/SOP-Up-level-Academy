import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardStoreWorkflow, phasesForShift } from "../lib/card-store-workflow.ts";
import {
  resolveShiftPhaseView,
  rosterFromAssignment
} from "../lib/shift-phase-visibility.ts";

const ids = (phases: { id: string }[]) => phases.map((p) => p.id);

describe("rosterFromAssignment", () => {
  it("maps working shifts to themselves", () => {
    assert.equal(rosterFromAssignment("s1"), "s1");
    assert.equal(rosterFromAssignment("s2"), "s2");
  });

  it("maps an explicit off cell to off", () => {
    assert.equal(rosterFromAssignment("off"), "off");
  });

  it("treats a missing / unknown cell as unrostered", () => {
    assert.equal(rosterFromAssignment(null), "unrostered");
    assert.equal(rosterFromAssignment(undefined), "unrostered");
    assert.equal(rosterFromAssignment("something-else"), "unrostered");
  });
});

describe("resolveShiftPhaseView", () => {
  it("neutral (admin/loading) shows every phase and is never an off day", () => {
    const view = resolveShiftPhaseView(cardStoreWorkflow, "neutral");
    assert.deepEqual(ids(view.phases), ids(cardStoreWorkflow));
    assert.equal(view.offDay, false);
    assert.equal(view.offLabel, null);
  });

  it("a working staffer only sees their own shift's phases and is not off", () => {
    for (const shift of ["s1", "s2"] as const) {
      const view = resolveShiftPhaseView(cardStoreWorkflow, shift);
      assert.deepEqual(ids(view.phases), ids(phasesForShift(cardStoreWorkflow, shift)));
      assert.equal(view.offDay, false);
      assert.equal(view.offLabel, null);
    }
  });

  it("a กะ2 staffer never sees the กะ1-only เปิดร้าน phase", () => {
    const view = resolveShiftPhaseView(cardStoreWorkflow, "s2");
    assert.equal(view.phases.some((p) => p.id === "open-store"), false);
  });

  it("an off day shows ALL phases (nothing hidden) but flags offDay so they are never late", () => {
    const view = resolveShiftPhaseView(cardStoreWorkflow, "off");
    assert.deepEqual(ids(view.phases), ids(cardStoreWorkflow));
    assert.equal(view.offDay, true);
    assert.equal(view.offLabel, "วันหยุด");
  });

  it("an unrostered day is an off day labelled ไม่มีกะวันนี้", () => {
    const view = resolveShiftPhaseView(cardStoreWorkflow, "unrostered");
    assert.deepEqual(ids(view.phases), ids(cardStoreWorkflow));
    assert.equal(view.offDay, true);
    assert.equal(view.offLabel, "ไม่มีกะวันนี้");
  });

  it("off-day view contains phases a working shift would have hidden (admins keep them all)", () => {
    // close-store is กะ2-only; an s1 filter drops it, but an off day must still list it.
    const s1 = resolveShiftPhaseView(cardStoreWorkflow, "s1");
    const off = resolveShiftPhaseView(cardStoreWorkflow, "off");
    assert.equal(s1.phases.some((p) => p.id === "close-store"), false);
    assert.equal(off.phases.some((p) => p.id === "close-store"), true);
  });
});
