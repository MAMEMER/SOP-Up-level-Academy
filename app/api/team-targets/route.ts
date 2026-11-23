import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";
import { GAMES, monthWeeks, type TeamTargets } from "../../../lib/team-targets.ts";
import { loadTeamTargets, saveTeamTargets, searchTeamProducts } from "../../../lib/team-targets-server.ts";
import { monthlyKpiV2 } from "../../../lib/kpi-v2-data.ts";
import { adminDb } from "../../../lib/firebase-admin.ts";
import { onePerStaffDay } from "../../../lib/planner-kpi.ts";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const owner = async () => { const user = await requireUser(); return isOwner(user.actualEmail) && !user.isImpersonating ? user : null; };
export async function GET(request: Request) {
  const user = await owner();
  if (!user) return json({ error: "forbidden" }, 403);
  const params = new URL(request.url).searchParams;
  if (params.has("products")) {
    try { return json({ products: await searchTeamProducts(params.get("products") || "") }); } catch { return json({ error: "ค้นหาสินค้าไม่ได้" }, 503); }
  }
  const month = params.get("month") || "";
  try {
    monthWeeks(month);
    const [report, rows, shifts, actuals] = await Promise.all([
      loadTeamTargets(month), monthlyKpiV2(month),
      adminDb().collection("schedule_shifts").where("workDate", ">=", `${month}-01`).where("workDate", "<=", `${month}-31`).get().catch(() => null),
      adminDb().collection("schedule_actual").where("workDate", ">=", `${month}-01`).where("workDate", "<=", `${month}-31`).get().catch(() => null)
    ]);
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const leave = new Map<string, Set<string>>();
    const addLeave = (code: string, date: string) => { if (!code || !date?.startsWith(month)) return; const dates = leave.get(code) || new Set<string>(); dates.add(date); leave.set(code, dates); };
    for (const shift of onePerStaffDay((shifts?.docs || []).map(doc => doc.data()))) if (shift.assignment === "leave_personal" || shift.assignment === "leave_sick" || shift.assignment === "leave_vacation") addLeave(shift.staffCode!, shift.workDate!);
    for (const doc of actuals?.docs || []) { const d = doc.data(); if (d.leaveType === "personal" || d.leaveType === "sick" || d.leaveType === "vacation") addLeave(d.staffCode, d.workDate); }
    const staff = rows.map(row => ({ code: row.person.code, name: row.name, total: row.total, incentiveEligible: row.incentiveEligible, availableDays: days - (leave.get(row.person.code)?.size || 0) }));
    return json({ ...report, staff, daysInMonth: days });
  } catch { return json({ error: "อ่านข้อมูลไม่ได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่" }, 503); }
}
export async function POST(request: Request) {
  const user = await owner();
  if (!user) return json({ error: "forbidden" }, 403);
  const body = await request.json().catch(() => null);
  try {
    monthWeeks(body?.month);
    const t = body?.targets as TeamTargets;
    const nums = [t.revenueTarget, t.budgetTarget, t.poolRevenuePct, t.poolPerGame, ...GAMES.map(g => t.eventTargets[g])];
    if ((t.budgetActual != null && (typeof t.budgetActual !== "number" || !Number.isFinite(t.budgetActual) || t.budgetActual < 0)) || nums.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0) || !Number.isInteger(t.passWeeks) || t.passWeeks < 1 || t.passWeeks > 6) return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
    if (t.heroProducts !== undefined && (!Array.isArray(t.heroProducts) || t.heroProducts.length > 50 || t.heroProducts.some(h => !h || typeof h.name !== "string" || !h.name.trim() || h.name.length > 200 || !Array.isArray(h.productIds) || !h.productIds.length || h.productIds.length > 100 || h.productIds.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || !Number.isFinite(h.unitTarget) || h.unitTarget <= 0 || !Number.isFinite(h.poolBonus) || h.poolBonus < 0))) return json({ error: "ข้อมูลสินค้าชูโรงไม่ถูกต้อง" }, 400);
    if (t.targetBasis && !["store_ex_preorder", "product_only"].includes(t.targetBasis)) return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
    await saveTeamTargets(body.month, { heroProducts: t.heroProducts || [], targetBasis: "product_only", revenueTarget: t.revenueTarget, budgetTarget: t.budgetTarget, budgetActual: t.budgetActual ?? null, poolRevenuePct: t.poolRevenuePct, poolPerGame: t.poolPerGame, passWeeks: t.passWeeks, eventTargets: Object.fromEntries(GAMES.map(g => [g, t.eventTargets[g]])) as TeamTargets["eventTargets"] }, user.actualEmail);
    return json({ ok: true });
  } catch { return json({ error: "บันทึกไม่ได้ กรุณาลองใหม่" }, 400); }
}
