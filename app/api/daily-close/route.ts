import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { getBranchDay, getOwnerDay } from "../../../lib/daily-close-server.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { allBranchKeys } from "../../../lib/store-config.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import {
  CASH_DENOMINATIONS,
  DAILY_CLOSE_COLLECTION,
  KSHOP_DAILY_COLLECTION,
  addDays,
  closeProblems,
  computeCash,
  dailyCloseId,
  round2,
  type CashInput,
  type DailyCloseDoc,
  type DailyCloseVersion
} from "../../../lib/daily-close.ts";

// ปิดยอดประจำวัน — พนักงานปิดของสาขาที่ตัวเองเข้ากะ (วันนี้หรือเมื่อวาน กรณีปิดเลยเที่ยงคืน),
// เจ้าของปิด/แก้ได้ทุกสาขาทุกวัน และใส่ยอดที่ธนาคารสรุปของ K SHOP.
// ยอดขายเงินสดคิดใหม่จาก StoreHub ฝั่ง server ทุกครั้ง — ไม่เชื่อตัวเลขจากเบราว์เซอร์.

export const dynamic = "force-dynamic";

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function staffMayClose(staffCode: string, branch: string, workDate: string): Promise<boolean> {
  const today = formatWorkDate();
  if (workDate !== today && workDate !== addDays(today, -1)) return false;
  return (await workBranchFor(staffCode, workDate)) === branch;
}

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const params = new URL(request.url).searchParams;
  const workDate = isDate(params.get("date")) ? params.get("date")! : formatWorkDate();
  if (params.get("scope") === "owner") {
    if (!isAdmin(user)) return forbidden();
    return NextResponse.json(await getOwnerDay(workDate), { headers: { "Cache-Control": "no-store" } });
  }
  const branch = params.get("branch") || "";
  if (!allBranchKeys().includes(branch)) return badRequest("unknown_branch");
  if (!isAdmin(user) && !(staffCode && (await staffMayClose(staffCode, branch, workDate)))) return forbidden();
  return NextResponse.json(await getBranchDay(branch, workDate), { headers: { "Cache-Control": "no-store" } });
}

function cleanCash(raw: unknown): CashInput | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  };
  const countsRaw = (body.counts && typeof body.counts === "object" ? body.counts : {}) as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const value of CASH_DENOMINATIONS) counts[String(value)] = Math.floor(num(countsRaw[String(value)]));
  const paidOuts = (Array.isArray(body.paidOuts) ? body.paidOuts : [])
    .slice(0, 30)
    .map((item) => ({ amount: num((item as { amount?: unknown })?.amount), note: String((item as { note?: unknown })?.note ?? "").slice(0, 200) }))
    .filter((item) => item.amount > 0 || item.note.trim());
  return { openingFloat: num(body.openingFloat), counts, paidOuts, floatKept: num(body.floatKept) };
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest();
  const nowIso = new Date().toISOString();

  if (body.action === "bankTotal") {
    if (!isAdmin(user)) return forbidden();
    const amount = Number(body.amount);
    if (!isDate(body.date) || !Number.isFinite(amount) || amount < 0) return badRequest("bad_amount");
    await db().collection(KSHOP_DAILY_COLLECTION).doc(body.date).set({
      workDate: body.date,
      amount: round2(amount),
      enteredBy: user.email,
      enteredAt: nowIso
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "close") return badRequest("unknown_action");
  const branch = String(body.branch || "");
  if (!allBranchKeys().includes(branch) || !isDate(body.date)) return badRequest("bad_branch_or_date");
  const workDate = body.date;
  if (!isAdmin(user) && !(staffCode && (await staffMayClose(staffCode, branch, workDate)))) return forbidden();

  const cash = cleanCash(body.cash);
  if (!cash) return badRequest("bad_cash");
  const note = String(body.note ?? "").slice(0, 1000);

  const day = await getBranchDay(branch, workDate);
  if (!day.pos) return NextResponse.json({ error: "pos_unavailable", detail: day.posError }, { status: 503 });
  const result = computeCash(cash, day.pos.cash);
  const problems = closeProblems(cash, result, note);
  if (problems.length) return NextResponse.json({ error: "problems", problems }, { status: 400 });

  const version: DailyCloseVersion = {
    cash,
    result,
    posCash: day.pos.cash,
    posByMethod: day.pos.byMethod,
    kshop: { total: day.pos.kshop.total, whole: day.pos.kshop.whole, store: day.pos.kshop.store, online: day.pos.kshop.online },
    note,
    closedBy: user.email,
    closedByName: user.name,
    closedAt: nowIso
  };
  // ปิดซ้ำได้ (นับใหม่/แก้) แต่ฉบับก่อนหน้าย้ายไปเก็บใน history เสมอ — ไม่มีใครลบร่องรอยเงินสดได้
  const ref = db().collection(DAILY_CLOSE_COLLECTION).doc(dailyCloseId(branch, workDate));
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as DailyCloseDoc) : null;
    const history = prev ? [...(prev.history ?? []), stripHistory(prev)] : [];
    tx.set(ref, { ...version, branch, workDate, history } satisfies DailyCloseDoc);
  });
  return NextResponse.json({ ok: true, result });
}

function stripHistory(doc: DailyCloseDoc): DailyCloseVersion {
  const { history: _history, branch: _branch, workDate: _workDate, ...version } = doc;
  return version;
}
