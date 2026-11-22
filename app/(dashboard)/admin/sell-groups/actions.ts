"use server";
import { requireUser, canWrite } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { adminDb } from "../../../../lib/firebase-admin.ts";
import { GAMES, type SellGroup } from "../../../../lib/sell-post.ts";
export async function saveGroups(groups: SellGroup[]) {
  const user = await requireUser(); if ((!isOwner(user.email) && user.role !== "admin") || !canWrite(user)) throw new Error("ไม่มีสิทธิ์แก้ไข");
  if (!Array.isArray(groups) || groups.length > 200) throw new Error("รายชื่อไม่ถูกต้อง");
  const clean = groups.map(g => {
    const name = String(g.name || "").trim().slice(0, 200), url = String(g.url || "").trim(), rules = String(g.rules || "").trim().slice(0, 1000);
    let parsed: URL; try { parsed = new URL(url); } catch { throw new Error("ลิงก์กลุ่มไม่ถูกต้อง"); }
    if (!name || parsed.protocol !== "https:" || !(parsed.hostname === "facebook.com" || parsed.hostname.endsWith(".facebook.com")) || !parsed.pathname.startsWith("/groups/")) throw new Error("ระบุชื่อและลิงก์กลุ่ม Facebook ให้ถูกต้อง");
    const games = Array.isArray(g.games) ? g.games.filter(v => (GAMES as readonly string[]).includes(v)) : [];
    if (!games.length) throw new Error("เลือกประเภทเกมอย่างน้อยหนึ่งประเภท");
    return {name, url, games, ...(rules ? {rules} : {})};
  });
  await adminDb().collection("sop_config").doc("sell_groups").set({ groups: clean });
}
