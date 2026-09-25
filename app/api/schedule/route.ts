import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { FieldValue } from "firebase-admin/firestore";
import type { ShiftAssignment } from "../../../lib/shift-schedule.ts";
import {
  BRANCH_SHIFTS_COLLECTION,
  cleanStartList,
  defaultBranchShiftConfig,
  isHhMm,
  normalizeBranchShiftConfig,
  type BranchShiftConfig
} from "../../../lib/branch-shift-config.ts";
import { allBranchKeys } from "../../../lib/store-config.ts";

// Server route for the shift planner collections (fix 1). Replaces the client Firestore
// store (lib/shift-schedule-store.ts). Reads: any signed-in user (the staff dashboard
// reads its own shift/day-event from here). Writes: admin only — the planner lives on the
// admin-guarded /admin/schedule page — and never while impersonating (read-only preview).

export const dynamic = "force-dynamic";

const SHIFTS = "schedule_shifts";
const EVENTS = "schedule_events";
const ACTUAL = "schedule_actual";
const AUDIT = "store_audit";

const monthOf = (workDate: string) => workDate.slice(0, 7);
const shiftDocId = (branch: string, workDate: string, staffCode: string) => `${branch}__${workDate}__${staffCode}`;
const eventDocId = (branch: string, workDate: string) => `${branch}__${workDate}`;

async function byMonth(name: string, branch: string, month: string) {
  const snap = await db().collection(name).where("branch", "==", branch).where("month", "==", month).get();
  return snap.docs.map((d) => d.data());
}

export async function GET(request: Request) {
  await actor(); // require a valid session; reads are open to any signed-in user
  const p = new URL(request.url).searchParams;
  const action = p.get("action");
  const branch = p.get("branch") || "";
  if (!branch) return badRequest("missing_branch");

  try {
    switch (action) {
      case "monthPlan": {
        const month = p.get("month") || "";
        if (!month) return badRequest("missing_month");
        // branch=all → ดึงทุกสาขาในคำขอเดียว (หน้าตารางโหมด "ทุกสาขา")
        const keys = branch === "all" ? allBranchKeys() : [branch];
        const perBranch = await Promise.all(
          keys.map(async (key) => {
            const [plans, events, actuals] = await Promise.all([
              byMonth(SHIFTS, key, month),
              byMonth(EVENTS, key, month),
              byMonth(ACTUAL, key, month)
            ]);
            return { plans, events, actuals };
          })
        );
        return NextResponse.json({
          plans: perBranch.flatMap((data) => data.plans),
          events: perBranch.flatMap((data) => data.events),
          actuals: perBranch.flatMap((data) => data.actuals)
        });
      }
      // เวลากะของทุกสาขา (เจ้าของแก้เองได้ที่หน้า /admin/schedule)
      case "branchShifts": {
        const keys = allBranchKeys();
        const snaps = await Promise.all(keys.map((key) => db().collection(BRANCH_SHIFTS_COLLECTION).doc(key).get()));
        const configs: BranchShiftConfig[] = keys.map((key, index) =>
          snaps[index].exists ? normalizeBranchShiftConfig(key, snaps[index].data()) : defaultBranchShiftConfig(key)
        );
        return NextResponse.json({ configs });
      }
      case "storeAudit": {
        const month = p.get("month") || "";
        if (!month) return badRequest("missing_month");
        const rows = await byMonth(AUDIT, branch, month);
        rows.sort((a, b) => String(a.workDate).localeCompare(String(b.workDate)));
        return NextResponse.json({ rows });
      }
      case "shiftForStaffDate": {
        const workDate = p.get("workDate") || "";
        const staffCode = p.get("staffCode") || "";
        if (!workDate || !staffCode) return badRequest("missing_params");
        const snap = await db().collection(SHIFTS).doc(shiftDocId(branch, workDate, staffCode)).get();
        return NextResponse.json({ plan: snap.exists ? snap.data() : null });
      }
      case "dayEvent": {
        const workDate = p.get("workDate") || "";
        if (!workDate) return badRequest("missing_workDate");
        const snap = await db().collection(EVENTS).doc(eventDocId(branch, workDate)).get();
        return NextResponse.json({ event: snap.exists ? snap.data() : null });
      }
      case "dayEventsForMonths": {
        const months = [...new Set((p.get("months") || "").split(",").map((m) => m.trim()).filter(Boolean))];
        if (!months.length) return NextResponse.json({ events: [] });
        const snaps = await Promise.all(months.map((month) => byMonth(EVENTS, branch, month)));
        return NextResponse.json({ events: snaps.flat() });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  // Every schedule write happens on the admin-only planner page.
  if (!isAdmin(user)) return forbidden();

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const nowIso = new Date().toISOString();
  const updatedBy = user.actualEmail; // identity from the session, not the client

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  try {
    switch (body.action) {
      case "savePlanCell": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staffCode = str(body.staffCode);
        const assignment = str(body.assignment) as ShiftAssignment;
        if (!branch || !workDate || !staffCode || !assignment) return badRequest("missing_params");
        const record: Record<string, unknown> = {
          branch,
          month: monthOf(workDate),
          workDate,
          staffCode,
          assignment,
          ...(str(body.startTime) ? { startTime: str(body.startTime) } : {}),
          updatedAt: nowIso,
          updatedBy
        };
        await db().collection(SHIFTS).doc(shiftDocId(branch, workDate, staffCode)).set(record);
        return NextResponse.json({ ok: true });
      }
      // เจ้าของตั้งเวลาเข้างานของแต่ละกะเอง (ช่วงเปิดสาขาใหม่เวลายังไม่นิ่ง)
      case "saveBranchShifts": {
        const branch = str(body.branch);
        if (!branch || !allBranchKeys().includes(branch)) return badRequest("unknown_branch");
        const starts = (body.starts || {}) as { s1?: unknown; s2?: unknown };
        const fallback = defaultBranchShiftConfig(branch);
        const s1 = cleanStartList(starts.s1);
        const s2 = cleanStartList(starts.s2);
        const config: BranchShiftConfig = {
          branch,
          starts: { s1: s1.length ? s1 : fallback.starts.s1, s2: s2.length ? s2 : fallback.starts.s2 },
          ...(isHhMm(body.closeTime) ? { closeTime: body.closeTime } : fallback.closeTime ? { closeTime: fallback.closeTime } : {}),
          workHours:
            typeof body.workHours === "number" && body.workHours > 0 && body.workHours <= 12
              ? body.workHours
              : fallback.workHours
        };
        await db().collection(BRANCH_SHIFTS_COLLECTION).doc(branch).set({ ...config, updatedAt: nowIso, updatedBy });
        return NextResponse.json({ ok: true, config });
      }

      // ย้ายคนไปอีกสาขาในวันเดียวกัน — ลบกะของสาขาอื่นทิ้ง ไม่งั้นจะค้างเป็นลงสองที่
      case "clearOtherBranchCells": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staffCode = str(body.staffCode);
        if (!branch || !workDate || !staffCode) return badRequest("missing_params");
        const others = allBranchKeys().filter((key) => key !== branch);
        await Promise.all(
          others.map((key) => db().collection(SHIFTS).doc(shiftDocId(key, workDate, staffCode)).delete())
        );
        return NextResponse.json({ ok: true, cleared: others.length });
      }

      case "saveDayEvent": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        if (!branch || !workDate) return badRequest("missing_params");
        const activities = Array.isArray(body.activities) ? body.activities : [];
        const record: Record<string, unknown> = {
          branch,
          month: monthOf(workDate),
          workDate,
          title: str(body.title),
          ...(str(body.note) ? { note: str(body.note) } : {}),
          ...(activities.length ? { activities } : {}),
          updatedAt: nowIso,
          updatedBy
        };
        await db().collection(EVENTS).doc(eventDocId(branch, workDate)).set(record);
        return NextResponse.json({ ok: true });
      }
      case "logLeave": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staffCode = str(body.staffCode);
        const leaveType = str(body.leaveType);
        if (!branch || !workDate || !staffCode || (leaveType !== "personal" && leaveType !== "sick"))
          return badRequest("missing_params");
        const record: Record<string, unknown> = {
          branch,
          month: monthOf(workDate),
          workDate,
          staffCode,
          leaveType,
          ...(str(body.note) ? { leaveNote: str(body.note) } : {}),
          updatedAt: nowIso,
          updatedBy
        };
        await db().collection(ACTUAL).doc(shiftDocId(branch, workDate, staffCode)).set(record, { merge: true });
        return NextResponse.json({ ok: true });
      }
      case "setActualStatus": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staffCode = str(body.staffCode);
        const status = str(body.status);
        if (!branch || !workDate || !staffCode) return badRequest("missing_params");
        const record: Record<string, unknown> = {
          branch,
          month: monthOf(workDate),
          workDate,
          staffCode,
          updatedAt: nowIso,
          updatedBy,
          leaveType:
            status === "leave_personal" ? "personal" : status === "leave_sick" ? "sick" : FieldValue.delete(),
          absent: status === "absent" ? true : FieldValue.delete(),
          swappedTo: FieldValue.delete(),
          swapNote: FieldValue.delete()
        };
        await db().collection(ACTUAL).doc(shiftDocId(branch, workDate, staffCode)).set(record, { merge: true });
        return NextResponse.json({ ok: true });
      }
      case "setSwap": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staffCode = str(body.staffCode);
        const swappedTo = str(body.swappedTo);
        if (!branch || !workDate || !staffCode || !swappedTo) return badRequest("missing_params");
        const record: Record<string, unknown> = {
          branch,
          month: monthOf(workDate),
          workDate,
          staffCode,
          updatedAt: nowIso,
          updatedBy,
          swappedTo,
          swapNote: str(body.note) || FieldValue.delete(),
          leaveType: FieldValue.delete(),
          absent: FieldValue.delete()
        };
        await db().collection(ACTUAL).doc(shiftDocId(branch, workDate, staffCode)).set(record, { merge: true });
        return NextResponse.json({ ok: true });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
