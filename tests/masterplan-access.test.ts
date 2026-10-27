import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASTERPLAN_MEMBERS, memberByKey, memberForEmail, safeNextPath } from "../lib/masterplan-access.ts";
import { sopUserForEmail } from "../lib/sop-users.ts";

describe("masterplan members", () => {
  it("is exactly the 4 leaders, with แชมป์ + ท้อป as editors", () => {
    assert.deepEqual(
      MASTERPLAN_MEMBERS.map((m) => [m.key, m.email, m.editor]),
      [
        ["champ", "champ.championest@gmail.com", true],
        ["top", "kananut.top@gmail.com", true],
        ["name", "namenrw@gmail.com", false],
        ["muk", "sin.sirisa@gmail.com", false]
      ]
    );
  });
  it("matches emails case- and whitespace-insensitively", () => {
    assert.equal(memberForEmail("  Kananut.Top@Gmail.com ")?.key, "top");
    assert.equal(memberForEmail("CHAMP.CHAMPIONEST@GMAIL.COM")?.key, "champ");
    assert.equal(memberForEmail("\tnamenrw@gmail.com\n")?.key, "name");
  });
  it("rejects everyone else", () => {
    assert.equal(memberForEmail("boomboom08755@gmail.com"), undefined);
    assert.equal(memberForEmail("kananut.top@gmail.com.evil.com"), undefined);
    assert.equal(memberForEmail(""), undefined);
    assert.equal(memberForEmail(null), undefined);
    assert.equal(memberForEmail(undefined), undefined);
  });
  it("memberByKey", () => {
    assert.equal(memberByKey("muk")?.name, "มุก");
    assert.equal(memberByKey("nobody"), undefined);
  });
});

describe("masterplan-only account gets no SOP access", () => {
  it("ท้อป is a masterplan member but NOT on the SOP allow-list", () => {
    assert.ok(memberForEmail("kananut.top@gmail.com"));
    assert.equal(sopUserForEmail("kananut.top@gmail.com"), undefined);
  });
});

describe("safeNextPath (?next= after sign-in)", () => {
  it("accepts same-site paths", () => {
    assert.equal(safeNextPath("/masterplan"), "/masterplan");
    assert.equal(safeNextPath("/masterplan/plan?x=1#s-2"), "/masterplan/plan?x=1#s-2");
    assert.equal(safeNextPath("/"), "/");
  });
  it("rejects open redirects and junk", () => {
    assert.equal(safeNextPath("//evil.com"), null);
    assert.equal(safeNextPath("/\\evil.com"), null);
    assert.equal(safeNextPath("https://evil.com"), null);
    assert.equal(safeNextPath("javascript:alert(1)"), null);
    assert.equal(safeNextPath("masterplan"), null);
    assert.equal(safeNextPath("/\t/evil.com"), null);
    assert.equal(safeNextPath("/\n/evil.com"), null);
    assert.equal(safeNextPath(""), null);
    assert.equal(safeNextPath(null), null);
    assert.equal(safeNextPath(undefined), null);
    assert.equal(safeNextPath(`/${"a".repeat(600)}`), null);
  });
});
