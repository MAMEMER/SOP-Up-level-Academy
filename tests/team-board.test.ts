import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personLoad, sortCards, validateCardDraft, visibleCards, type BoardCard } from "../lib/team-board.ts";

const keys = ["champ", "name", "muk", "top"];
const card = (over: Partial<BoardCard>): BoardCard => ({
  id: "c", title: "t", note: "", owner: "", due: "", column: "todo", createdBy: "champ",
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", ...over
});

describe("team board", () => {
  it("validates drafts", () => {
    assert.deepEqual(validateCardDraft({ title: "  ถ่ายรูป   สินค้า ", owner: "muk", due: "2026-11-05" }, keys), {
      ok: true, value: { title: "ถ่ายรูป สินค้า", note: "", owner: "muk", due: "2026-11-05" }
    });
    assert.equal(validateCardDraft({ title: "" }, keys).ok, false);
    assert.equal(validateCardDraft({ title: "x", owner: "bob" }, keys).ok, false);
    assert.equal(validateCardDraft({ title: "x", due: "5 พ.ย." }, keys).ok, false);
  });
  it("hides deleted cards and old done cards", () => {
    const now = "2026-11-10T00:00:00.000Z";
    const cards = [
      card({ id: "a" }),
      card({ id: "b", deleted: true }),
      card({ id: "c", column: "done", doneAt: "2026-11-09T00:00:00.000Z" }),
      card({ id: "d", column: "done", doneAt: "2026-10-01T00:00:00.000Z" })
    ];
    assert.deepEqual(visibleCards(cards, now).map((c) => c.id), ["a", "c"]);
  });
  it("counts load per person, ignoring done", () => {
    const cards = [
      card({ owner: "name", column: "doing" }),
      card({ owner: "name", due: "2026-11-01" }),
      card({ owner: "name", column: "done" }),
      card({ owner: "muk" }), card({ owner: "muk" }), card({ owner: "muk" })
    ];
    const load = personLoad(cards, keys, "2026-11-04");
    assert.deepEqual(load[1], { key: "name", todo: 1, doing: 1, late: 1, level: "free" });
    assert.equal(load[2].level, "mid");
    assert.equal(load[0].level, "free");
  });
  it("sorts by due date first", () => {
    const list = [card({ id: "x" }), card({ id: "y", due: "2026-11-09" }), card({ id: "z", due: "2026-11-05" })].sort(sortCards);
    assert.deepEqual(list.map((c) => c.id), ["z", "y", "x"]);
  });
});
