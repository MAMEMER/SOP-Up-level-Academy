"use server";
import { requireUser, canWrite } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { adminDb } from "../../../lib/firebase-admin.ts";
import { searchTeamProducts } from "../../../lib/team-targets-server.ts";
import { canGenerate, filterSellGroups, generateVariants, type SellGroup } from "../../../lib/sell-post.ts";
import { FieldValue } from "firebase-admin/firestore";

async function identity() { const user = await requireUser(); const code = employeeCodeForEmail(user.email); if (!code || !canWrite(user)) throw new Error("บัญชีนี้ไม่สามารถบันทึกงานได้"); return code; }
export async function searchProducts(q: string) { await requireUser(); return searchTeamProducts(q.slice(0, 100)); }
export async function getSellData(game: string) {
  const code = await identity(); const db = adminDb();
  const month = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  const [groups, posts] = await Promise.all([db.collection("sop_config").doc("sell_groups").get(), db.collection("sop_sell_posts").where("staffCode", "==", code).get()]);
  return { groups: filterSellGroups((groups.data()?.groups || []) as SellGroup[], game), count: posts.docs.filter(d => new Date(new Date(String(d.data().at || "")).getTime() + 7 * 3600000).toISOString().startsWith(month)).length };
}
export async function writeSellPost(input: {productId?: string; productName: string; price: string; notes: string; quantity: string; branch: string}) {
  const code = await identity();
  const name = String(input.productName || "").trim().slice(0, 200); const price = Number(input.price);
  if (!name || !input.price.trim() || !Number.isFinite(price) || price < 0 || !["บางแค", "เสนาเฟสท์", "ส่งพัสดุ"].includes(input.branch)) throw new Error("กรุณาระบุสินค้า ราคา และช่องทางรับสินค้า");
  const quantity = input.quantity.trim(); if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1)) throw new Error("จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ยังไม่ได้ตั้งค่าระบบเขียนโพสต์");
  const db = adminDb(); const now = new Date(); const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const ref = db.collection("sop_sell_post_limits").doc(`${code}__${day}`);
  await db.runTransaction(async tx => { const snap = await tx.get(ref); const count = Number(snap.data()?.count || 0); if (!canGenerate(count)) throw new Error("ครบจำนวนครั้งสำหรับวันนี้แล้ว"); tx.set(ref, { count: count + 1, staffCode: code, day }); });
  try {
    const variants = await generateVariants(async retry => {
      const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 600, system: "เขียนโพสต์ขายภาษาไทยแบบพนักงานร้าน เป็นมิตร สั้นอ่านง่าย ไม่ใช้อีโมจิ แฮชแท็กไม่เกิน 3 ห้ามแต่งราคา สต็อก หรือความขาดแคลน ใช้เฉพาะข้อมูลที่ให้ ห้ามเสนอสมาชิกฟรี ช่องทางสั่งซื้อคือ inbox เพจ / LINE OA / หน้าร้าน ตอบ JSON object เท่านั้น รูปแบบ {\"short\":\"...\",\"detailed\":\"...\"}", messages: [{ role: "user", content: JSON.stringify({ product: name, price, notes: String(input.notes || "").slice(0, 1000), quantity, pickup: input.branch, retry }) }] }) });
      if (!response.ok) throw new Error("เขียนโพสต์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      const body = await response.json(); const raw = body.content?.filter((v: {type: string}) => v.type === "text").map((v: {text: string}) => v.text).join("") || "";
      try { const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); return [parsed.short, parsed.detailed].filter((v): v is string => typeof v === "string"); } catch { return []; }
    });
    const post = await db.collection("sop_sell_posts").add({ staffCode: code, ...(input.productId ? { productId: String(input.productId).slice(0, 200) } : {}), productName: name, price, at: now.toISOString(), groupsOpened: [] });
    return { variants, postId: post.id };
  } catch (error) { await ref.update({count: FieldValue.increment(-1)}); throw error; }
}
export async function logGroupOpened(postId: string, groupName: string) {
  const code = await identity(); if (!/^[a-zA-Z0-9]{20}$/.test(postId)) return;
  const ref = adminDb().collection("sop_sell_posts").doc(postId); const snap = await ref.get();
  if (snap.data()?.staffCode === code) await ref.update({ groupsOpened: FieldValue.arrayUnion(groupName.slice(0, 200)) });
}
