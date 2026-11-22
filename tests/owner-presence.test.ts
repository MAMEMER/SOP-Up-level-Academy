import test from "node:test";
import assert from "node:assert/strict";
import { presenceByDate, presenceId, validatePresence, type OwnerPresence } from "../lib/owner-presence.ts";

const mark = (over: Partial<OwnerPresence>): OwnerPresence => ({
  id: "x", date: "2026-11-07", member: "champ", branch: "bangkae", updatedAt: "", ...over
});

test("validatePresence — วันที่ต้องเป็น YYYY-MM-DD, สาขาว่าง = ไม่เข้า", () => {
  assert.deepEqual(validatePresence({ date: "2026-11-07", branch: "senafest" }), { ok: true, date: "2026-11-07", branch: "senafest" });
  assert.deepEqual(validatePresence({ date: "2026-11-07", branch: "" }), { ok: true, date: "2026-11-07", branch: "" });
  assert.equal(validatePresence({ date: "7/11/2026", branch: "bangkae" }).ok, false);
  assert.equal(validatePresence({ date: "2026-11-07", branch: "siam" }).ok, false);
});

test("presenceId — หนึ่งคนหนึ่งสาขาต่อวัน", () => {
  assert.equal(presenceId("2026-11-07", "name"), "2026-11-07_name");
});

test("presenceByDate — เรียง แชมป์ · เนม · มุก และตัดข้อมูลแปลกทิ้ง", () => {
  const map = presenceByDate([
    mark({ member: "muk" }),
    mark({ member: "name", branch: "senafest" }),
    mark({ member: "champ" }),
    mark({ member: "top" as never }),
    mark({ date: "2026-11-08", member: "name", branch: "other" as never })
  ]);
  assert.deepEqual(map.get("2026-11-07")?.map((p) => p.member), ["champ", "name", "muk"]);
  assert.equal(map.has("2026-11-08"), false);
});
