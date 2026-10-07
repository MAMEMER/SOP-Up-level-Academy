import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { isOwner } from "../../../lib/owner.ts";
import { displayNameFor } from "../../../lib/employee-directory.ts";
import { FEEDBACK, OVERRIDES, WATCH } from "../../../lib/card-prices-server.ts";
import { feedbackError, type Verdict } from "../../../lib/card-prices.ts";

// ราคากลางการ์ด — ช่องเขียนของเว็บ (ราคาเองบอทเป็นคนเขียน card_ref_prices)
//  - feedback      พนักงานทุกคน: ทักท้วงราคา/การ์ด
//  - closeFeedback แอดมิน: ปิดเรื่องที่ดูแล้ว
//  - override / clearOverride  เจ้าของ: ยืนยันราคาร้าน
//  - watch / unwatch  สเกาต์: พนักงานจับตาให้ตัวเอง, แอดมินสั่งให้ใครก็ได้
// ตัวตนผู้เขียนเอาจาก session เสมอ ไม่เชื่อจาก body

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const docId = (v: unknown) => {
  const value = str(v, 64);
  return value && /^[\w-]+$/.test(value) ? value : "";
};
const price = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null;
};

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const at = new Date().toISOString();
  const byName = (staffCode && displayNameFor(staffCode)) || user.name;
  const fs = db();

  try {
    switch (body.action) {
      case "feedback": {
        const rowId = docId(body.rowId);
        const verdict = str(body.verdict, 20) as Verdict;
        const err = feedbackError(verdict, body.suggest);
        if (!rowId || err) return badRequest(err || "missing_row");
        const ref = await fs.collection(FEEDBACK).add({
          rowId,
          key: str(body.key, 200),
          name: str(body.name, 120),
          verdict,
          suggest: price(body.suggest),
          note: str(body.note, 500),
          byCode: staffCode,
          byName,
          at,
          status: "open"
        });
        return NextResponse.json({ ok: true, id: ref.id, at });
      }
      case "closeFeedback": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        await fs.collection(FEEDBACK).doc(id).update({ status: "closed", closedBy: byName, closedAt: at });
        return NextResponse.json({ ok: true, at });
      }
      case "override": {
        if (!isOwner(user.actualEmail)) return forbidden();
        const rowId = docId(body.rowId);
        const value = price(body.price);
        if (!rowId || !value) return badRequest("ใส่ราคาร้านเป็นตัวเลขบาท");
        await fs.collection(OVERRIDES).doc(rowId).set({
          key: str(body.key, 200),
          name: str(body.name, 120),
          price: value,
          note: str(body.note, 300),
          byName,
          at
        });
        // ยืนยันราคาแล้ว = เรื่องที่ทักท้วงใบนี้ปิดไปด้วย
        const open = await fs.collection(FEEDBACK).where("rowId", "==", rowId).where("status", "==", "open").get();
        await Promise.all(open.docs.map((d) => d.ref.update({ status: "closed", closedBy: byName, closedAt: at })));
        return NextResponse.json({ ok: true, at });
      }
      case "clearOverride": {
        if (!isOwner(user.actualEmail)) return forbidden();
        const rowId = docId(body.rowId);
        if (!rowId) return badRequest("missing_row");
        await fs.collection(OVERRIDES).doc(rowId).delete();
        return NextResponse.json({ ok: true, at });
      }
      case "watch": {
        const query = str(body.query, 120);
        const key = str(body.key, 200);
        if (!query && !key) return badRequest("พิมพ์ชื่อการ์ดที่จะให้จับตา");
        const target = isAdmin(user) ? str(body.staffCode, 20) || staffCode : staffCode;
        if (!target) return badRequest("ยังไม่รู้ว่าจะให้ใครจับตา");
        const ref = await fs.collection(WATCH).add({
          key,
          query,
          game: str(body.game, 20),
          name: str(body.name, 120) || query,
          maxPrice: price(body.maxPrice),
          staffCode: target,
          staffName: displayNameFor(target) || target,
          createdByCode: staffCode,
          createdByName: byName,
          createdAt: at,
          active: true,
          hits: 0
        });
        return NextResponse.json({ ok: true, id: ref.id, at });
      }
      case "unwatch": {
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const ref = fs.collection(WATCH).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const w = snap.data() as { staffCode?: string; createdByCode?: string };
        if (!isAdmin(user) && w.staffCode !== staffCode && w.createdByCode !== staffCode) return forbidden();
        await ref.update({ active: false, stoppedBy: byName, stoppedAt: at });
        return NextResponse.json({ ok: true, at });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
