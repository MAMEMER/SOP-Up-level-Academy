import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOwner, OWNER_EMAILS } from "../lib/owner.ts";

describe("owner tier", () => {
  it("recognizes owner emails (champ + nem)", () => {
    assert.equal(isOwner("champ.championest@gmail.com"), true);
    assert.equal(isOwner("namenrw@gmail.com"), true);
    assert.equal(isOwner("CHAMP.CHAMPIONEST@gmail.com"), true); // case-insensitive
  });
  it("rejects non-owner admins + empty", () => {
    assert.equal(isOwner("boomboom08755@gmail.com"), false);
    assert.equal(isOwner(""), false);
    assert.equal(isOwner(null), false);
    assert.equal(isOwner(undefined), false);
  });
  it("owner list = exactly 2", () => {
    assert.equal(OWNER_EMAILS.length, 2);
  });
});
