import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { fetchEmployeeNames, fetchTimesheets, hasStoreHubCreds, toBangkok } from "../../../../lib/storehub-api.ts";
import { resolveEmployeeCode } from "../../../../lib/employee-directory.ts";
import { restUpsertDoc } from "../../../../lib/firestore-rest.ts";

// Pulls StoreHub timesheets for a month and writes the earliest clock-in per staff-day
// into Firestore `schedule_actual` (merged, so leave records are preserved). The planner
// ACTUAL row + attendance KPI then show real clock-in. Admin-gated; also callable by a
// Vercel cron with the CRON_SECRET.
async function isAllowed(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret && url.searchParams.get("key") === secret) return true;
  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  const session = await verifySession(cookie);
  const user = session ? sopUserForEmail(session.email) : undefined;
  return user?.role === "admin";
}

function monthRange(month: string): { fromIso: string; toIso: string } {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1, -7, 0, 0)); // 00:00 +07 of the 1st
  const to = new Date(Date.UTC(year, mon, 0, 16, 59, 59)); // 23:59 +07 of the last day
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export async function GET(request: Request) {
  if (!(await isAllowed(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasStoreHubCreds()) return NextResponse.json({ error: "storehub_not_configured" }, { status: 503 });

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  const branch = url.searchParams.get("branch") || "bangkae";

  try {
    const { fromIso, toIso } = monthRange(month);
    const [names, timesheets] = await Promise.all([fetchEmployeeNames(), fetchTimesheets(fromIso, toIso)]);

    // earliest clock-in per staff-day
    const earliest = new Map<string, { workDate: string; staffCode: string; time: string }>();
    for (const ts of timesheets) {
      if (!ts.clockInTime) continue;
      const name = names[ts.employeeId];
      const staffCode = name ? resolveEmployeeCode(name) : "";
      if (!staffCode || staffCode === name) continue; // unresolved → skip
      const { workDate, time } = toBangkok(ts.clockInTime);
      const key = `${workDate}__${staffCode}`;
      const existing = earliest.get(key);
      if (!existing || time < existing.time) earliest.set(key, { workDate, staffCode, time });
    }

    const nowIso = new Date(Date.now()).toISOString();
    await Promise.all(
      [...earliest.values()].map((e) =>
        restUpsertDoc("schedule_actual", `${branch}__${e.workDate}__${e.staffCode}`, {
          branch,
          month,
          workDate: e.workDate,
          staffCode: e.staffCode,
          clockIn: e.time,
          clockInSource: "storehub",
          updatedAt: nowIso,
          updatedBy: "storehub-sync"
        })
      )
    );

    return NextResponse.json({ ok: true, month, synced: earliest.size });
  } catch (error) {
    return NextResponse.json({ error: "sync_failed", detail: String(error) }, { status: 500 });
  }
}
