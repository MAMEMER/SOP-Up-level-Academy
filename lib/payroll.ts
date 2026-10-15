// เงินเดือนพนักงาน (คำนวณสด ไม่เก็บผลลัพธ์) — งวดครึ่งเดือน: A = วันที่ 1–15, B = 16–สิ้นเดือน.
//
//  ประจำ (full_time):  เงินเดือน/2 − หักตามคะแนน KPI + รายการปรับ
//  พาร์ทไทม์ (part_time): เรทรายวัน × วันที่มาทำงานจริง (มีตอกบัตร) − หักตามคะแนน KPI + รายการปรับ
//
// กติกา (INVARIANTS):
//  - ยอดหักตามคะแนนมาจาก `salaryDeduction` ของระบบคะแนนเดิม (lib/performance-score.ts) ตรงๆ
//    ไฟล์นี้ไม่คิดสูตรหักเอง และไม่เก็บยอดหักลง Firestore (§1, §3)
//  - ที่เก็บได้มีแค่ "ค่าตั้งต้น" (เงินเดือน/เรท) และ "รายการปรับ" (บวก/ลบ + เหตุผล) ซึ่งยกเลิกได้
//    แต่ไม่ลบ — เก็บว่าใครทำอะไรเมื่อไรทุกครั้ง
//  - OT ระบบแค่ "เสนอ" จากเวลาตอกบัตรเข้า-ออก เจ้าของต้องกดยืนยันก่อนจึงกลายเป็นรายการปรับ

export type EmploymentType = "full_time" | "part_time";

export type PayPeriod = { id: string; label: string; startDate: string; endDate: string };

export type PayProfile = {
  code: string;
  type: EmploymentType;
  /** เงินเดือนต่อเดือน (ประจำ) */
  monthlySalary?: number | null;
  /** ค่าแรงต่อวัน (พาร์ทไทม์) */
  dailyRate?: number | null;
  /** ค่า OT ต่อชั่วโมง — ไม่ใส่ = คิดจากฐาน × 1.5 */
  otRatePerHour?: number | null;
  updatedAt?: string;
  updatedBy?: string;
};

export type AdjustmentKind = "ot" | "bonus" | "deduction" | "advance" | "other";
export const ADJUSTMENT_LABEL: Record<AdjustmentKind, string> = {
  ot: "OT",
  bonus: "โบนัส / เพิ่ม",
  deduction: "หัก",
  advance: "เบิกล่วงหน้า",
  other: "อื่นๆ"
};

export type PayAdjustment = {
  id: string;
  code: string;
  periodId: string;
  kind: AdjustmentKind;
  /** บาท มีเครื่องหมาย: + เพิ่มให้พนักงาน, − หัก */
  amount: number;
  reason: string;
  hours?: number;
  createdAt: string;
  createdBy: string;
  voided?: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
};

export type WorkDay = {
  date: string;
  clockIn?: string;
  clockOut?: string;
  hours?: number | null;
  /** เวลาเลิกกะตามตาราง "HH:MM" — OT นับจากเวลาออกที่เกินจุดนี้ (มาก่อนเวลาไม่นับ) */
  scheduledEnd?: string;
};

/** อยู่ร้านนานกว่านี้ในวันเดียว = เกือบแน่ว่าลืมตอกออก ไม่เอามาคิด OT */
export const MAX_PLAUSIBLE_HOURS = 14;

export type PayInputs = {
  code: string;
  name: string;
  /** ประเภทจากรายชื่อพนักงาน ใช้เมื่อยังไม่ได้ตั้งในหน้าค่าจ้าง */
  directoryType: EmploymentType;
  profile?: PayProfile;
  /** วันที่มีกะ s1/s2 ในงวด (ไม่รวมวันที่ยังไม่ถึง) */
  scheduledDates: string[];
  /** วันที่มีตอกบัตรเข้า (รวมวันที่มาแทนกะคนอื่น) */
  clockIns: WorkDay[];
  kpi?: { score: number; hasData: boolean; deduction: number; pointsShort: number } | null;
  adjustments: PayAdjustment[];
  /** ชั่วโมงงานต่อกะปกติ — เกินจากนี้ = OT ที่ระบบเสนอ */
  shiftHours: number;
};

export type PayLine = {
  code: string;
  name: string;
  type: EmploymentType;
  configured: boolean;
  /** ค่าที่ตั้งไว้ (ให้ฟอร์มตั้งค่าเติมค่าเดิม) */
  rates: { monthlySalary: number | null; dailyRate: number | null; otRatePerHour: number | null };
  base: number;
  baseText: string;
  daysScheduled: number;
  daysWorked: number;
  workedDates: string[];
  /** มีกะแต่ไม่มีตอกบัตร */
  missedDates: string[];
  /** ตอกบัตรแต่ไม่มีกะ (มาแทน/มาเพิ่ม) */
  extraDates: string[];
  kpiScore: number | null;
  kpiDeduction: number;
  kpiText: string;
  otRate: number;
  otSuggestion: { hours: number; amount: number; days: Array<{ date: string; hours: number }> };
  adjustments: PayAdjustment[];
  adjustmentTotal: number;
  net: number;
  warnings: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- งวด ----------
export function periodFor(id: string): PayPeriod | null {
  const m = id.match(/^(\d{4})-(\d{2})-([AB])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${m[1]}-${m[2]}-`;
  const half = m[3] === "A";
  return {
    id,
    label: `${half ? "1" : "16"}–${half ? "15" : last} ${THAI_MONTH[month - 1]} ${year}`,
    startDate: `${prefix}${half ? "01" : "16"}`,
    endDate: `${prefix}${half ? "15" : String(last)}`
  };
}
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function periodIdForDate(date: string): string {
  return `${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? "A" : "B"}`;
}

export function shiftPeriod(id: string, step: number): string {
  const p = periodFor(id);
  if (!p) return id;
  let year = Number(id.slice(0, 4));
  let month = Number(id.slice(5, 7));
  let idx = (month - 1) * 2 + (id.endsWith("A") ? 0 : 1) + step;
  year += Math.floor(idx / 24);
  idx = ((idx % 24) + 24) % 24;
  month = Math.floor(idx / 2) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${idx % 2 ? "B" : "A"}`;
}

// ---------- OT ----------
/** ค่า OT ต่อชั่วโมงเริ่มต้นตามกฎหมายแรงงาน (วันทำงานปกติ 1.5 เท่าของค่าจ้างรายชั่วโมง) */
export function defaultOtRate(type: EmploymentType, profile?: PayProfile): number {
  if (profile?.otRatePerHour && profile.otRatePerHour > 0) return profile.otRatePerHour;
  const hourly = type === "full_time" ? (profile?.monthlySalary || 0) / 30 / 8 : (profile?.dailyRate || 0) / 8;
  return round2(hourly * 1.5);
}

/** ชั่วโมงเกินกะ ปัดลงทีละครึ่งชั่วโมง (เกินไม่ถึง 30 นาทีไม่นับ) */
export function otHours(hours: number | null | undefined, shiftHours: number): number {
  if (!hours || hours <= shiftHours) return 0;
  return Math.floor((hours - shiftHours) * 2) / 2;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** OT ของวันหนึ่ง: มีเวลาเลิกกะ = เวลาออก − เวลาเลิกกะ · ไม่มีกะ (มาแทน) = ชั่วโมงรวม − ชั่วโมงกะ */
export function otForDay(d: WorkDay, shiftHours: number): { hours: number; suspect: boolean } {
  if (d.hours == null || !d.clockOut) return { hours: 0, suspect: false };
  if (d.hours > MAX_PLAUSIBLE_HOURS) return { hours: 0, suspect: true };
  if (d.scheduledEnd) {
    const over = minutes(d.clockOut) - minutes(d.scheduledEnd);
    return { hours: over >= 30 ? Math.floor(over / 30) / 2 : 0, suspect: false };
  }
  return { hours: otHours(d.hours, shiftHours), suspect: false };
}

// ---------- คำนวณ ----------
export function computePayLine(input: PayInputs): PayLine {
  const type = input.profile?.type || input.directoryType;
  const warnings: string[] = [];
  const scheduled = new Set(input.scheduledDates);
  const clocked = new Map(input.clockIns.map((d) => [d.date, d]));
  const workedDates = [...clocked.keys()].sort();
  const missedDates = [...scheduled].filter((d) => !clocked.has(d)).sort();
  const extraDates = workedDates.filter((d) => !scheduled.has(d));

  let base = 0;
  let baseText = "";
  let configured = true;
  if (type === "full_time") {
    const salary = input.profile?.monthlySalary || 0;
    if (!salary) {
      configured = false;
      warnings.push("ยังไม่ได้ตั้งเงินเดือน");
    }
    base = round2(salary / 2);
    baseText = salary ? `เงินเดือน ${salary.toLocaleString("th-TH")} ÷ 2` : "ยังไม่ได้ตั้งเงินเดือน";
  } else {
    const rate = input.profile?.dailyRate || 0;
    if (!rate) {
      configured = false;
      warnings.push("ยังไม่ได้ตั้งเรทรายวัน");
    }
    base = round2(rate * workedDates.length);
    baseText = rate ? `${workedDates.length} วัน × ${rate.toLocaleString("th-TH")}` : "ยังไม่ได้ตั้งเรทรายวัน";
  }
  if (missedDates.length) warnings.push(`มีกะแต่ไม่มีตอกบัตร ${missedDates.length} วัน — ถ้ามาทำงานจริงให้เพิ่มรายการปรับ`);

  const kpiDeduction = input.kpi?.hasData ? input.kpi.deduction : 0;
  const kpiScore = input.kpi?.hasData ? input.kpi.score : null;
  const kpiText = !input.kpi?.hasData
    ? "ยังไม่มีข้อมูลคะแนนในงวดนี้"
    : kpiDeduction
      ? `คะแนน ${input.kpi.score} ขาด ${input.kpi.pointsShort} คะแนนจาก 50`
      : `คะแนน ${input.kpi.score} ไม่ถูกหัก`;

  const otRate = defaultOtRate(type, input.profile);
  const otChecked = input.clockIns.map((d) => ({ date: d.date, ...otForDay(d, input.shiftHours) }));
  const otDays = otChecked
    .filter((d) => d.hours > 0)
    .map(({ date, hours }) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const suspect = otChecked.filter((d) => d.suspect).map((d) => d.date).sort();
  if (suspect.length) warnings.push(`น่าจะลืมตอกออก ${suspect.length} วัน (อยู่เกิน ${MAX_PLAUSIBLE_HOURS} ชม.) — ไม่ได้คิด OT วันนั้น`);
  const otTotalHours = otDays.reduce((s, d) => s + d.hours, 0);

  const active = input.adjustments.filter((a) => !a.voided);
  const adjustmentTotal = round2(active.reduce((s, a) => s + a.amount, 0));
  // OT ที่ยืนยันแล้ว (รายการปรับชนิด OT) ไม่ต้องเสนอซ้ำ
  const otApproved = active.filter((a) => a.kind === "ot").reduce((s, a) => s + (a.hours || 0), 0);
  const otRemaining = Math.max(0, otTotalHours - otApproved);

  return {
    code: input.code,
    name: input.name,
    type,
    configured,
    rates: {
      monthlySalary: input.profile?.monthlySalary ?? null,
      dailyRate: input.profile?.dailyRate ?? null,
      otRatePerHour: input.profile?.otRatePerHour ?? null
    },
    base,
    baseText,
    daysScheduled: scheduled.size,
    daysWorked: workedDates.length,
    workedDates,
    missedDates,
    extraDates,
    kpiScore,
    kpiDeduction,
    kpiText,
    otRate,
    otSuggestion: { hours: otRemaining, amount: round2(otRemaining * otRate), days: otDays },
    adjustments: [...input.adjustments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    adjustmentTotal,
    net: round2(base - kpiDeduction + adjustmentTotal),
    warnings
  };
}

export function payrollTotals(lines: PayLine[]) {
  return {
    base: round2(lines.reduce((s, l) => s + l.base, 0)),
    kpiDeduction: round2(lines.reduce((s, l) => s + l.kpiDeduction, 0)),
    adjustments: round2(lines.reduce((s, l) => s + l.adjustmentTotal, 0)),
    net: round2(lines.reduce((s, l) => s + l.net, 0)),
    unconfigured: lines.filter((l) => !l.configured).length
  };
}

// ---------- ตรวจข้อมูลที่เจ้าของกรอก ----------
export function validateAdjustment(input: { amount: unknown; reason: unknown; kind: unknown; hours?: unknown }): string | null {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) return "ใส่จำนวนเงิน (บวก = เพิ่ม, ลบ = หัก)";
  if (Math.abs(amount) > 200000) return "จำนวนเงินมากผิดปกติ";
  if (typeof input.reason !== "string" || input.reason.trim().length < 3) return "ต้องใส่เหตุผล";
  if (typeof input.kind !== "string" || !(input.kind in ADJUSTMENT_LABEL)) return "ประเภทไม่ถูกต้อง";
  if (input.hours !== undefined && input.hours !== null && input.hours !== "") {
    const h = Number(input.hours);
    if (!Number.isFinite(h) || h <= 0 || h > 200) return "ชั่วโมงไม่ถูกต้อง";
  }
  return null;
}

export function validateProfile(input: { type: unknown; monthlySalary?: unknown; dailyRate?: unknown; otRatePerHour?: unknown }): string | null {
  if (input.type !== "full_time" && input.type !== "part_time") return "เลือกประเภท ประจำ / พาร์ทไทม์";
  const check = (v: unknown, max: number) => v === undefined || v === null || v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max);
  if (!check(input.monthlySalary, 500000)) return "เงินเดือนไม่ถูกต้อง";
  if (!check(input.dailyRate, 20000)) return "เรทรายวันไม่ถูกต้อง";
  if (!check(input.otRatePerHour, 5000)) return "ค่า OT ไม่ถูกต้อง";
  return null;
}

/** CSV สำหรับส่งบัญชี/โอนเงิน */
export function payrollCsv(period: PayPeriod, lines: PayLine[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["งวด", "รหัส", "ชื่อ", "ประเภท", "ฐาน", "รายละเอียดฐาน", "วันทำงาน", "หักตามคะแนน", "รายการปรับ", "รายละเอียดการปรับ", "สุทธิ"],
    ...lines.map((l) => [
      period.label,
      l.code,
      l.name,
      l.type === "full_time" ? "ประจำ" : "พาร์ทไทม์",
      l.base,
      l.baseText,
      l.daysWorked,
      -l.kpiDeduction,
      l.adjustmentTotal,
      l.adjustments.filter((a) => !a.voided).map((a) => `${a.amount > 0 ? "+" : ""}${a.amount} ${a.reason}`).join(" / "),
      l.net
    ])
  ];
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
}
