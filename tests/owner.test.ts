import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOwner, OWNER_EMAILS } from "../lib/owner.ts";

describe("owner tier", () => {
  it("recognizes owner emails (champ + nem + ken)", () => {
    assert.equal(isOwner("champ.championest@gmail.com"), true);
    assert.equal(isOwner("namenrw@gmail.com"), true);
    assert.equal(isOwner("kittibhonlim@gmail.com"), true); // เคน — หุ้นส่วน (2026-08-15)
    assert.equal(isOwner("CHAMP.CHAMPIONEST@gmail.com"), true); // case-insensitive
  });
  it("rejects non-owner admins + empty", () => {
    assert.equal(isOwner("boomboom08755@gmail.com"), false);
    assert.equal(isOwner(""), false);
    assert.equal(isOwner(null), false);
    assert.equal(isOwner(undefined), false);
  });
  it("owner list = the three partners, nobody else", () => {
    assert.deepEqual(OWNER_EMAILS, [
      "champ.championest@gmail.com",
      "namenrw@gmail.com",
      "kittibhonlim@gmail.com",
    ]);
  });
});
