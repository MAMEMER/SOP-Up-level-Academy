import { NextResponse } from "next/server";
import { isOwner } from "../../../lib/owner.ts";
import { requireUser } from "../../../lib/auth.ts";
import { adminDb } from "../../../lib/firebase-admin.ts";
import { invalidateStaffCache } from "../../../lib/staff-store.ts";
import { LEAVE_KINDS, validDate, type Position } from "../../../lib/leave-entitlement.ts";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await requireUser();
  if ((user.role !== "admin" && !isOwner(user.actualEmail)) || user.isImpersonating) return NextResponse.json({error:"forbidden"}, {status:403});
  const body = await request.json().catch(() => null);
  if (body?.action === "startDate") {
    if (typeof body.email !== "string" || typeof body.startDate !== "string" || (body.startDate && !validDate(body.startDate))) return NextResponse.json({error:"invalid"}, {status:400});
    const ref = adminDb().collection("sop_staff").doc(body.email.toLowerCase());
    if (!(await ref.get()).exists) return NextResponse.json({error:"not_found"}, {status:404});
    await ref.update({startDate: body.startDate}); invalidateStaffCache();
  } else if (body?.action === "policy") {
    const p = body.policy; const positions: Position[] = ["temporary", "regular", "branch_manager"];
    if (p?.year !== "calendar" || !Number.isInteger(p.vacationAfterMonths) || p.vacationAfterMonths < 0 || p.vacationAfterMonths > 1200 || positions.some(pos => LEAVE_KINDS.some(kind => !Number.isInteger(p.byPosition?.[pos]?.[kind]) || p.byPosition[pos][kind] < 0 || p.byPosition[pos][kind] > 366))) return NextResponse.json({error:"invalid"}, {status:400});
    await adminDb().collection("sop_config").doc("leave_policy").set({year:"calendar", byPosition:p.byPosition, vacationAfterMonths:p.vacationAfterMonths});
  } else return NextResponse.json({error:"invalid"}, {status:400});
  return NextResponse.json({ok:true});
}
