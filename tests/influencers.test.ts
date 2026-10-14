import test from "node:test";
import assert from "node:assert/strict";
import { initialInfluencers, influencerSchema, matchesInfluencer, mergeInfluencers, emptyInfluencer } from "../lib/influencers.ts";

test("all 15 supplied channels are valid with original contact and rate details", () => {
  assert.equal(initialInfluencers.length, 15);
  assert.equal(new Set(initialInfluencers.map(row => row.id)).size, 15);
  for (const { id, revision, ...fields } of initialInfluencers) assert.equal(influencerSchema.safeParse(fields).success, true, id);
  assert.equal(initialInfluencers.filter(row => row.status === "ยังไม่ทัก").length, 12);
  assert.equal(initialInfluencers.find(row => row.name === "Penguin Hut")?.lastContact, "2026-10-14T16:55");
  assert.match(initialInfluencers.find(row => row.platform === "FB+TikTok")!.rate, /18,000/);
});
test("shared edits replace seeds without resetting existing notes or duplicating additions", () => {
  const edited = { ...initialInfluencers[0], note: "ตอบแล้ว", status: "คุยอยู่" as const, revision: 2 };
  const added = { ...edited, id: "new-channel" };
  const rows = mergeInfluencers([edited, added]);
  assert.equal(rows.length, 16);
  assert.equal(rows[0].note, "ตอบแล้ว");
  assert.equal(rows[0].revision, 2);
});
test("combined platform belongs to both filters; status and search compose", () => {
  const row = initialInfluencers.find(row => row.platform === "FB+TikTok")!;
  assert.equal(matchesInfluencer(row, "แพงไป", "FB", "Gaming"), true);
  assert.equal(matchesInfluencer(row, "แพงไป", "TikTok", "จุ่มเกลือ"), true);
  assert.equal(matchesInfluencer(row, "", "IG", ""), false);
  assert.equal(matchesInfluencer(row, "ตกลง", "FB", ""), false);
});
test("unsafe links, unknown fields and oversized history snapshots are rejected", () => {
  const valid = { ...emptyInfluencer, name: "ช่อง", links: "https://example.com" };
  assert.equal(influencerSchema.safeParse(valid).success, true);
  for (const links of ["javascript:alert(1)", "https://example.com, data:text/html,test", "not-a-url"]) assert.equal(influencerSchema.safeParse({ ...valid, links }).success, false);
  assert.equal(influencerSchema.safeParse({ ...valid, note: "a".repeat(5001) }).success, false);
  assert.equal(influencerSchema.safeParse({ ...valid, by: "fake actor" }).success, false);
});
