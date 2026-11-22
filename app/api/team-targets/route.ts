import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";
import { GAMES, monthWeeks, type TeamTargets } from "../../../lib/team-targets.ts";
import { loadTeamTargets, loadWorkedHours, saveTeamTargets } from "../../../lib/team-targets-server.ts";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const owner = async () => { const user = await requireUser(); return isOwner(user.actualEmail) && !user.isImpersonating ? user : null; };
export async function GET(request: Request) {
  const user = await owner();
  if (!user) return json({ error: "forbidden" }, 403);
  const params = new URL(request.url).searchParams;
  const month = params.get("month") || "";
  try {
    monthWeeks(month);
    const report = await loadTeamTargets(month);
    const eligible = [...new Set((params.get("eligible") || "").split(",").map(x => x.trim()).filter(x => /^[a-zA-Z0-9_-]{1,20}$/.test(x)))];
    const hours = eligible.length ? await loadWorkedHours(month, eligible) : [];
    return json({ ...report, hours });
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
    if (t.targetBasis && !["store_ex_preorder", "product_only"].includes(t.targetBasis)) return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
    await saveTeamTargets(body.month, { targetBasis: t.targetBasis || "store_ex_preorder", revenueTarget: t.revenueTarget, budgetTarget: t.budgetTarget, budgetActual: t.budgetActual ?? null, poolRevenuePct: t.poolRevenuePct, poolPerGame: t.poolPerGame, passWeeks: t.passWeeks, eventTargets: Object.fromEntries(GAMES.map(g => [g, t.eventTargets[g]])) as TeamTargets["eventTargets"] }, user.actualEmail);
    return json({ ok: true });
  } catch { return json({ error: "บันทึกไม่ได้ กรุณาลองใหม่" }, 400); }
}
