import "server-only";
import { adminDb } from "./firebase-admin.ts";
import { fetchChecklistKpiInput } from "./checklist-kpi.ts";
import { resolveEmployeeCode } from "./employee-directory.ts";
import { fetchPerformanceDailyStore } from "./performance-daily-store.ts";
import { getPerformanceScoreRowsForRange } from "./performance-score-data.ts";
import { fetchAttendanceSource } from "./planner-kpi.ts";
import { fetchEmployeeNames, fetchTimesheets, hasStoreHubCreds, toBangkok } from "./storehub-api.ts";
import { ensureStaffLoaded, listStaff } from "./staff-store.ts";
import {
  computePayLine,
  payrollTotals,
  periodFor,
  type AdjustmentKind,
  type PayAdjustment,
  type PayLine,
  type PayPeriod,
  type PayProfile,
  type WorkDay
} from "./payroll.ts";

// เงินเดือนงวดครึ่งเดือน — คำนวณสดทุกครั้ง (INVARIANTS §3: ไม่เก็บยอดหักลง DB).
// เก็บแค่: ค่าตั้งต้นต่อคน (sop_payroll_profiles) · รายการปรับ (sop_payroll_adjustments, ยกเลิกได้แต่ไม่ลบ)
// · บันทึกทุกการแก้ (sop_payroll_log). เจ้าของร้านเท่านั้น — ตรวจที่ route.

const PROFILES = "sop_payroll_profiles";
const ADJUSTMENTS = "sop_payroll_adjustments";
const LOG = "sop_payroll_log";
const SHIFT_HOURS = 9;

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export type PayrollReport = {
  period: PayPeriod;
  today: string;
  ended: boolean;
  lines: PayLine[];
  totals: ReturnType<typeof payrollTotals>;
  notes: string[];
};

/** ชั่วโมงทำงานต่อคนต่อวันจาก StoreHub (เข้า→ออก) — ใช้เสนอ OT เท่านั้น */
async function hoursByStaffDay(period: PayPeriod): Promise<Map<string, WorkDay>> {
  const out = new Map<string, WorkDay>();
  const from = new Date(`${period.startDate}T00:00:00+07:00`).toISOString();
  const to = new Date(`${period.endDate}T23:59:59+07:00`).toISOString();
  const [names, sheets] = await Promise.all([fetchEmployeeNames(), fetchTimesheets(from, to)]);
  for (const ts of sheets) {
    if (!ts.clockInTime) continue;
    const name = names[ts.employeeId] || "";
    const code = name ? resolveEmployeeCode(name) : "";
    if (!code || code === name) continue;
    const { workDate, time } = toBangkok(ts.clockInTime);
    const key = `${code}__${workDate}`;
    const day = out.get(key) ?? { date: workDate, hours: 0 };
    if (!day.clockIn || time < day.clockIn) day.clockIn = time;
    if (ts.clockOutTime) {
      const outTime = toBangkok(ts.clockOutTime).time;
      if (!day.clockOut || outTime > day.clockOut) day.clockOut = outTime;
      day.hours = (day.hours || 0) + (Date.parse(ts.clockOutTime) - Date.parse(ts.clockInTime)) / 3600_000;
    } else {
      day.hours = null; // ลืมตอกออก = ไม่รู้ชั่วโมง ไม่เสนอ OT
    }
    out.set(key, day);
  }
  return out;
}

export async function loadPayroll(periodId: string): Promise<PayrollReport> {
  const period = periodFor(periodId);
  if (!period) throw new Error("bad_period");
  const today = bangkokToday();
  const until = period.endDate < today ? period.endDate : today;
  const notes: string[] = [];
  if (period.endDate >= today) notes.push("งวดนี้ยังไม่จบ ตัวเลขยังเปลี่ยนได้ (วันทำงาน คะแนน และ OT)");

  await ensureStaffLoaded();
  const db = adminDb();
  const [staff, profileSnap, adjSnap, attendance] = await Promise.all([
    listStaff(),
    db.collection(PROFILES).get(),
    db.collection(ADJUSTMENTS).where("periodId", "==", period.id).get(),
    fetchAttendanceSource()
  ]);
  const roster = staff.filter((s) => s.active && s.onRoster && s.code);
  const profiles = new Map(profileSnap.docs.map((d) => [d.id, d.data() as PayProfile]));
  const adjustments = adjSnap.docs.map((d) => ({ ...(d.data() as PayAdjustment), id: d.id }));

  // คะแนน KPI ของงวด — ใช้ salaryDeduction ของระบบคะแนนเดิมตรงๆ
  let kpiRows: Awaited<ReturnType<typeof getPerformanceScoreRowsForRange>> = [];
  if (period.startDate <= today) {
    try {
      const [dailyStore, checklist] = await Promise.all([
        fetchPerformanceDailyStore(),
        fetchChecklistKpiInput("bangkae", period.startDate, until)
      ]);
      kpiRows = getPerformanceScoreRowsForRange(
        { id: "custom", label: period.label, startDate: period.startDate, endDate: until },
        dailyStore,
        attendance,
        checklist.submittedDays,
        checklist.lateSubmissions
      );
    } catch (error) {
      notes.push(`อ่านคะแนน KPI ไม่ได้: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let hours = new Map<string, WorkDay>();
  if (hasStoreHubCreds() && period.startDate <= today) {
    try {
      hours = await hoursByStaffDay(period);
    } catch (error) {
      notes.push(`อ่านเวลาเข้า-ออกจาก StoreHub ไม่ได้ (ไม่มีข้อเสนอ OT): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const inRange = (d: string) => d >= period.startDate && d <= until;
  const lines = roster.map((s) => {
    const code = s.code as string;
    const scheduledDates = [...new Set(attendance.schedules.filter((x) => x.employeeName === code && inRange(x.workDate)).map((x) => x.workDate))];
    const clockDates = [...new Set(attendance.clockEvents.filter((x) => x.employeeName === code && inRange(x.workDate)).map((x) => x.workDate))];
    const endOf = new Map(
      attendance.schedules
        .filter((x) => x.employeeName === code && inRange(x.workDate))
        .map((x) => [x.workDate, toBangkok(x.scheduledEnd).time])
    );
    const clockIns: WorkDay[] = clockDates.map((date) => {
      const h = hours.get(`${code}__${date}`);
      return { date, clockIn: h?.clockIn, clockOut: h?.clockOut, hours: h ? h.hours : null, scheduledEnd: endOf.get(date) };
    });
    const row = kpiRows.find((r) => r.employeeName === code);
    return computePayLine({
      code,
      name: s.displayName || s.name || code,
      directoryType: s.employmentType === "full_time" ? "full_time" : "part_time",
      profile: profiles.get(code),
      scheduledDates,
      clockIns,
      kpi: row
        ? { score: row.totalScore, hasData: row.hasData, deduction: row.salaryDeduction?.amount || 0, pointsShort: row.salaryDeduction?.pointsShort || 0 }
        : null,
      adjustments: adjustments.filter((a) => a.code === code),
      shiftHours: SHIFT_HOURS
    });
  });

  return { period, today, ended: period.endDate < today, lines, totals: payrollTotals(lines), notes };
}

// ---------- เขียน (เจ้าของร้านเท่านั้น) ----------
export async function saveProfile(code: string, input: Omit<PayProfile, "code" | "updatedAt" | "updatedBy">, by: string): Promise<void> {
  const db = adminDb();
  const ref = db.collection(PROFILES).doc(code);
  const before = (await ref.get()).data() || null;
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const next: PayProfile = {
    code,
    type: input.type,
    monthlySalary: num(input.monthlySalary),
    dailyRate: num(input.dailyRate),
    otRatePerHour: num(input.otRatePerHour),
    updatedAt: new Date().toISOString(),
    updatedBy: by
  };
  const batch = db.batch();
  batch.set(ref, next);
  batch.set(db.collection(LOG).doc(), { action: "profile", code, before, after: next, by, at: next.updatedAt });
  await batch.commit();
}

export async function addAdjustment(
  input: { code: string; periodId: string; kind: AdjustmentKind; amount: number; reason: string; hours?: number | null },
  by: string
): Promise<string> {
  const db = adminDb();
  const ref = db.collection(ADJUSTMENTS).doc();
  const doc: Omit<PayAdjustment, "id"> = {
    code: input.code,
    periodId: input.periodId,
    kind: input.kind,
    amount: Math.round(input.amount * 100) / 100,
    reason: input.reason.trim(),
    ...(input.hours ? { hours: input.hours } : {}),
    createdAt: new Date().toISOString(),
    createdBy: by
  };
  const batch = db.batch();
  batch.set(ref, doc);
  batch.set(db.collection(LOG).doc(), { action: "adjust", id: ref.id, ...doc, by, at: doc.createdAt });
  await batch.commit();
  return ref.id;
}

/** ยกเลิกรายการปรับ — ไม่ลบ เก็บไว้ว่าใครยกเลิก เพราะอะไร */
export async function voidAdjustment(id: string, reason: string, by: string): Promise<string | null> {
  const db = adminDb();
  const ref = db.collection(ADJUSTMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return "ไม่พบรายการ";
  if (snap.data()?.voided) return "รายการนี้ถูกยกเลิกไปแล้ว";
  const at = new Date().toISOString();
  const batch = db.batch();
  batch.update(ref, { voided: true, voidedAt: at, voidedBy: by, voidReason: reason });
  batch.set(db.collection(LOG).doc(), { action: "void", id, reason, by, at });
  await batch.commit();
  return null;
}
