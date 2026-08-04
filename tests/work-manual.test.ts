import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardStoreWorkflow } from "../lib/card-store-workflow.ts";
import { applyManualOverrides, cleanManualOverrides, seedManualFromPhases } from "../lib/work-manual.ts";

const openStore = () => cardStoreWorkflow.find((phase) => phase.id === "open-store")!;

describe("owner-edited work manual", () => {
  it("replaces only the fields the owner filled in", () => {
    const applied = applyManualOverrides(cardStoreWorkflow, {
      "open-store": { goal: "เป้าหมายใหม่" }
    });
    const phase = applied.find((item) => item.id === "open-store")!;

    assert.equal(phase.goal, "เป้าหมายใหม่");
    assert.equal(phase.caution, openStore().caution);
    assert.deepEqual(phase.sections, openStore().sections);
    // the checklist is owned by the other editor and must not be touched here
    assert.deepEqual(phase.checklist, openStore().checklist);
  });

  it("replaces the steps when the owner rewrote them", () => {
    const applied = applyManualOverrides(cardStoreWorkflow, {
      "open-store": { sections: [{ title: "ขั้นตอนเดียว", tasks: ["ทำอันนี้", ""] }] }
    });
    const phase = applied.find((item) => item.id === "open-store")!;

    assert.equal(phase.sections.length, 1);
    assert.deepEqual(phase.sections[0].tasks, ["ทำอันนี้"]);
  });

  it("keeps the built-in text when an override is blank", () => {
    const applied = applyManualOverrides(cardStoreWorkflow, {
      "open-store": { goal: "   ", sections: [] }
    });
    const phase = applied.find((item) => item.id === "open-store")!;

    assert.equal(phase.goal, openStore().goal);
    assert.deepEqual(phase.sections, openStore().sections);
  });

  it("seeds the editor with whatever is live today", () => {
    const seeded = seedManualFromPhases(cardStoreWorkflow, { "open-store": { goal: "เป้าหมายใหม่" } });

    assert.equal(seeded["open-store"].goal, "เป้าหมายใหม่");
    assert.equal(seeded["open-store"].caution, openStore().caution);
    assert.equal(seeded["close-store"].goal, cardStoreWorkflow.find((p) => p.id === "close-store")!.goal);
  });

  it("drops blank rows on save", () => {
    const cleaned = cleanManualOverrides({
      "open-store": { goal: " ok ", sections: [{ title: " ", tasks: [" ", ""] }, { title: "จริง", tasks: [" งาน "] }] }
    });

    assert.equal(cleaned["open-store"].goal, "ok");
    assert.deepEqual(cleaned["open-store"].sections, [{ title: "จริง", tasks: ["งาน"] }]);
  });
});
