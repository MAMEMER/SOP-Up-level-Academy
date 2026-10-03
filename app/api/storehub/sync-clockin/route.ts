import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { fetchEmployeeNames, fetchTimesheets, hasStoreHubCreds, toBangkok } from "../../../../lib/storehub-api.ts";
import { branchFor, resolveEmployeeCode } from "../../../../lib/employee-directory.ts";
import { onePerStaffDay } from "../../../../lib/planner-kpi.ts";
import { ensureStaffLoaded } from "../../../../lib/staff-store.ts";
import { restDeleteDoc, restListCollection, restUpsertDoc } from "../../../../lib/firestore-rest.ts";
import { allBranchKeys, branchForStoreHubStore } from "../../../../lib/store-config.ts";

// ฟิลด์ที่ sync นี้เขียนเอง — doc ใน schedule_actual ที่มีแค่ฟิลด์พวกนี้ = มาจาก StoreHub ล้วน ลบทิ้งได้
// ถ้ามีฟิลด์อื่น (ลา / สลับกะ / แก้มือ) ห้ามแตะ
const SYNC_ONLY_FIELDS = new Set(["branch", "month", "workDate", "staffCode", "clockIn", "clockInSource", "updatedAt", "updatedBy"]);

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

  // Hydrate the LIVE staff roster (sop_staff) before resolving StoreHub names to codes.
  // The Vercel cron calls this route with the CRON_SECRET and NO user session, so
  // requireUser()/ensureStaffLoaded() never ran — resolveEmployeeCode would fall back to the
  // compiled-in seed (Boom/Leo/ICE...) and write clock-ins under stale codes that no longer
  // exist on the shift plan (UP-003...), producing orphan "Unmatched StoreHub clock-in" rows.
  await ensureStaffLoaded();

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  // StoreHub เป็นบัญชีเดียวของทั้งสองสาขา — ตอกบัตรของแต่ละคนต้องลงสาขาที่คนนั้นมีกะวันนั้น
  // (ไม่ใช่สาขาที่หน้าตารางเปิดอยู่) ไม่งั้นทุกคนได้ clock-in ซ้ำทั้งสองสาขา. `?branch=` ไม่ใช้แล้ว.

  try {
    const { fromIso, toIso } = monthRange(month);
    const [names, timesheets] = await Promise.all([fetchEmployeeNames(), fetchTimesheets(fromIso, toIso)]);

    // earliest clock-in per staff-day; store-account (Uplevel Academy) sessions go to a
    // separate open/close audit (store open = earliest clock-in, close = latest clock-out).
    const earliest = new Map<string, { workDate: string; staffCode: string; time: string; storeBranch?: string }>();
    const audit = new Map<string, { branch: string; workDate: string; open?: string; close?: string }>();
    for (const ts of timesheets) {
      if (!ts.clockInTime) continue;
      const name = names[ts.employeeId] || "";
      const isStore = name.toLowerCase().includes("academy");
      if (isStore) {
        const { workDate, time: open } = toBangkok(ts.clockInTime);
        const close = ts.clockOutTime ? toBangkok(ts.clockOutTime).time : undefined;
        // บัญชีร้านตอกที่เครื่องสาขาไหน = สาขานั้น (storeId จาก StoreHub) — เดาจากชื่อเฉพาะตอนไม่มี storeId
        const storeBranch = branchForStoreHubStore(ts.storeId) ?? (/sena|เสนา/i.test(name) ? "senafest" : "bangkae");
        const cur = audit.get(`${storeBranch}__${workDate}`) ?? { branch: storeBranch, workDate };
        if (!cur.open || open < cur.open) cur.open = open;
        if (close && (!cur.close || close > cur.close)) cur.close = close;
        audit.set(`${storeBranch}__${workDate}`, cur);
        continue;
      }
      const staffCode = name ? resolveEmployeeCode(name) : "";
      if (!staffCode || staffCode === name) continue; // unresolved → skip
      const { workDate, time } = toBangkok(ts.clockInTime);
      const key = `${workDate}__${staffCode}`;
      const existing = earliest.get(key);
      if (!existing || time < existing.time) earliest.set(key, { workDate, staffCode, time, storeBranch: branchForStoreHubStore(ts.storeId) });
    }

    const plans = onePerStaffDay(
      (await restListCollection<{ branch?: string; month?: string; workDate?: string; staffCode?: string; assignment?: string; updatedAt?: string }>(
        "schedule_shifts"
      )).filter((plan) => plan.month === month)
    );
    const plannedBranch = new Map(plans.map((plan) => [`${plan.workDate}__${plan.staffCode}`, plan.branch || ""]));
    // สาขาที่ตอกบัตรจริง (เครื่อง POS ของสาขาไหน) ชนะตารางกะ — ตารางใช้เฉพาะตอน StoreHub ไม่บอก storeId
    const branchOf = (workDate: string, staffCode: string) =>
      earliest.get(`${workDate}__${staffCode}`)?.storeBranch || plannedBranch.get(`${workDate}__${staffCode}`) || branchFor(staffCode);

    const nowIso = new Date(Date.now()).toISOString();
    await Promise.all(
      [...earliest.values()].map((e) =>
        restUpsertDoc("schedule_actual", `${branchOf(e.workDate, e.staffCode)}__${e.workDate}__${e.staffCode}`, {
          branch: branchOf(e.workDate, e.staffCode),
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

    // คนที่ย้ายสาขาหลัง sync รอบก่อน: เวลาตอกบัตรเก่าค้างอยู่อีกสาขา → ลบเฉพาะ doc ที่ sync เขียนล้วนๆ
    const actuals = await restListCollection<Record<string, unknown> & { branch?: string; month?: string; workDate?: string; staffCode?: string }>(
      "schedule_actual"
    );
    const stale = actuals.filter((doc) => {
      if (doc.month !== month || !doc.workDate || !doc.staffCode || !doc.branch) return false;
      if (!earliest.has(`${doc.workDate}__${doc.staffCode}`)) return false;
      if (doc.branch === branchOf(doc.workDate, doc.staffCode)) return false;
      return doc.clockInSource === "storehub" && Object.keys(doc).every((field) => SYNC_ONLY_FIELDS.has(field));
    });
    // ลบไม่สำเร็จบางใบก็ไม่ให้ทั้งรอบล้ม (store_audit ข้างล่างยังต้องเขียน) — รอบหน้าลบซ้ำเอง
    await Promise.allSettled(
      stale
        .filter((doc) => allBranchKeys().includes(doc.branch!))
        .map((doc) => restDeleteDoc("schedule_actual", `${doc.branch}__${doc.workDate}__${doc.staffCode}`))
    );

    await Promise.all(
      [...audit.values()].map((a) =>
        restUpsertDoc("store_audit", `${a.branch}__${a.workDate}`, {
          branch: a.branch,
          month,
          workDate: a.workDate,
          ...(a.open ? { openTime: a.open } : {}),
          ...(a.close ? { closeTime: a.close } : {}),
          updatedAt: nowIso,
          updatedBy: "storehub-sync"
        })
      )
    );

    return NextResponse.json({ ok: true, month, synced: earliest.size, audit: audit.size, movedStale: stale.length });
  } catch (error) {
    return NextResponse.json({ error: "sync_failed", detail: String(error) }, { status: 500 });
  }
}
