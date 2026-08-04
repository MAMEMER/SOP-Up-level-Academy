// Every number the KPI engine scores with, in one place.
//
// The rules used to be literals scattered through performance-score.ts, which meant the
// only way to answer "ตอนนี้หักยังไง" was to read the code, and the only way to change a
// rate was a deploy. They now live here as data: the engine reads them, /admin/kpi-rules
// renders them as the live rulebook, and the owner can retune any number from that page.
//
// Storage lives in lib/kpi-rules-store.ts. This half stays free of server-only imports so
// the maths can be unit-tested.

export const KPI_RULES_COLLECTION = "sop_kpi_rules";
export const KPI_RULES_DOC = "default";

export type IncentiveTierRule = { min: number; percent: 0 | 20 | 50 | 80 | 100; label: string };

export type KpiRules = {
  /** points a category starts from — 5 categories × 20 = 100 */
  categoryMax: number;
  attendance: {
    missingClockIn: number;
    lateOver10Minutes: number;
    lateWithin10Minutes: number;
    lateGraceMinutes: number;
  };
  stock: {
    /** ไม่ได้นับ: ครั้งที่ 1..escalateAfter คิด notCountedFirst, หลังจากนั้นคิด notCountedAfter */
    notCountedFirst: number;
    notCountedAfter: number;
    notCountedEscalateAfter: number;
    slowCount: number;
    realLoss: number;
  };
  checklist: {
    missingDayFirst: number;
    missingDayAfter: number;
    missingDayEscalateAfter: number;
    missingImportant: number;
    /** ต่อหัวข้อที่ส่งช้ากว่าเวลาที่กำหนด */
    lateSubmit: number;
    falseRecord: number;
    backfilled: number;
  };
  customerService: {
    /** เคสแรก / แก้ได้ทันที */
    fixedImmediately: number;
    /** ซ้ำเรื่องเดิม หรือรุนแรง — ติดธง coach ด้วย */
    repeatedOrSevere: number;
  };
  assignedWork: {
    lateOneDay: number;
    /** ไม่เสร็จเกินกำหนด — ติดธง coach ด้วย */
    notFinished: number;
  };
  incentive: { tiers: IncentiveTierRule[] };
  salary: {
    /** คะแนนรวมต่ำกว่านี้ถึงเริ่มหักเงิน */
    threshold: number;
    /** full time: คะแนนที่ขาด × เรตนี้ */
    fullTimeRatePerPoint: number;
    /** part time: %คะแนนที่ขาด × (วันทำงาน × เรตรายวัน) */
    partTimeDailyRate: number;
  };
  leave: { sickAllowance: number; personalAllowance: number };
};

export const defaultKpiRules: KpiRules = {
  categoryMax: 20,
  attendance: {
    missingClockIn: 2,
    lateOver10Minutes: 2,
    lateWithin10Minutes: 1,
    lateGraceMinutes: 10
  },
  stock: {
    notCountedFirst: 10,
    notCountedAfter: 5,
    notCountedEscalateAfter: 2,
    slowCount: 2,
    realLoss: 2
  },
  checklist: {
    missingDayFirst: 10,
    missingDayAfter: 5,
    missingDayEscalateAfter: 2,
    missingImportant: 1,
    lateSubmit: 2,
    falseRecord: 10,
    backfilled: 0
  },
  customerService: { fixedImmediately: 5, repeatedOrSevere: 10 },
  assignedWork: { lateOneDay: 1, notFinished: 5 },
  incentive: {
    tiers: [
      { min: 90, percent: 100, label: "90-100" },
      { min: 80, percent: 80, label: "80-89" },
      { min: 70, percent: 50, label: "70-79" },
      { min: 60, percent: 20, label: "60-69" },
      { min: 0, percent: 0, label: "ต่ำกว่า 60" }
    ]
  },
  salary: { threshold: 50, fullTimeRatePerPoint: 500, partTimeDailyRate: 400 },
  leave: { sickAllowance: 30, personalAllowance: 3 }
};

export type KpiRulesOverride = {
  [K in keyof KpiRules]?: KpiRules[K] extends object ? Partial<KpiRules[K]> : KpiRules[K];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Owner overrides on top of the defaults, one level deep. A missing or malformed number
 * keeps the default — a broken rule doc must never zero out someone's score.
 */
export function mergeKpiRules(override?: KpiRulesOverride | null): KpiRules {
  if (!override) return defaultKpiRules;

  const merged: KpiRules = {
    ...defaultKpiRules,
    attendance: { ...defaultKpiRules.attendance },
    stock: { ...defaultKpiRules.stock },
    checklist: { ...defaultKpiRules.checklist },
    customerService: { ...defaultKpiRules.customerService },
    assignedWork: { ...defaultKpiRules.assignedWork },
    incentive: { tiers: defaultKpiRules.incentive.tiers.map((tier) => ({ ...tier })) },
    salary: { ...defaultKpiRules.salary },
    leave: { ...defaultKpiRules.leave }
  };

  if (isFiniteNumber(override.categoryMax) && override.categoryMax > 0) merged.categoryMax = override.categoryMax;

  const groups = ["attendance", "stock", "checklist", "customerService", "assignedWork", "salary", "leave"] as const;
  for (const group of groups) {
    const patch = override[group] as Record<string, unknown> | undefined;
    if (!patch) continue;
    for (const [key, value] of Object.entries(patch)) {
      if (!isFiniteNumber(value) || value < 0) continue;
      (merged[group] as Record<string, number>)[key] = value;
    }
  }

  const tiers = override.incentive?.tiers;
  if (Array.isArray(tiers) && tiers.length) {
    const cleaned = tiers
      .filter((tier) => isFiniteNumber(tier?.min) && [0, 20, 50, 80, 100].includes(tier?.percent))
      .map((tier) => ({ min: tier.min, percent: tier.percent, label: String(tier.label || `${tier.min}+`) }))
      .sort((left, right) => right.min - left.min);
    if (cleaned.length) merged.incentive = { tiers: cleaned };
  }

  return merged;
}

/** The rulebook as rows for the owner page — label, current value, unit, and what it means. */
export type KpiRuleRow = {
  path: string;
  category: string;
  label: string;
  value: number;
  unit: string;
  note?: string;
};

export function kpiRuleRows(rules: KpiRules): KpiRuleRow[] {
  return [
    { path: "attendance.missingClockIn", category: "เข้างาน", label: "ไม่มี clock-in (หรือสายเกิน 30 นาที)", value: rules.attendance.missingClockIn, unit: "ต่อวัน", note: "กะที่ยังไม่ถึงเวลาเข้างานยังไม่ถูกคิด · วันที่ลาที่อนุมัติแล้วไม่คิด" },
    { path: "attendance.lateOver10Minutes", category: "เข้างาน", label: `สายเกิน ${rules.attendance.lateGraceMinutes} นาที`, value: rules.attendance.lateOver10Minutes, unit: "ต่อวัน" },
    { path: "attendance.lateWithin10Minutes", category: "เข้างาน", label: `สายไม่เกิน ${rules.attendance.lateGraceMinutes} นาที`, value: rules.attendance.lateWithin10Minutes, unit: "ต่อวัน" },
    { path: "attendance.lateGraceMinutes", category: "เข้างาน", label: "เส้นแบ่งสายน้อย/สายมาก", value: rules.attendance.lateGraceMinutes, unit: "นาที" },

    { path: "stock.notCountedFirst", category: "Stock", label: `ไม่ได้นับ stock — ${rules.stock.notCountedEscalateAfter} ครั้งแรก`, value: rules.stock.notCountedFirst, unit: "ต่อครั้ง" },
    { path: "stock.notCountedAfter", category: "Stock", label: "ไม่ได้นับ stock — ครั้งถัดไป", value: rules.stock.notCountedAfter, unit: "ต่อครั้ง" },
    { path: "stock.notCountedEscalateAfter", category: "Stock", label: "นับกี่ครั้งแรกที่หักเรตแพง", value: rules.stock.notCountedEscalateAfter, unit: "ครั้ง" },
    { path: "stock.slowCount", category: "Stock", label: "นับช้าเกินกรอบเช้า", value: rules.stock.slowCount, unit: "ต่อครั้ง" },
    { path: "stock.realLoss", category: "Stock", label: "ยอดไม่ตรงจริง (ของหาย/ขาด)", value: rules.stock.realLoss, unit: "ต่อครั้ง", note: "ไม่ตรงแต่แก้ได้ใน 24 ชม. = ไม่หัก · ส่งให้เจ้าของตรวจ = ติดธง ไม่หักอัตโนมัติ" },

    { path: "checklist.missingDayFirst", category: "Checklist", label: `ขาด checklist ทั้งวัน — ${rules.checklist.missingDayEscalateAfter} ครั้งแรก`, value: rules.checklist.missingDayFirst, unit: "ต่อวัน" },
    { path: "checklist.missingDayAfter", category: "Checklist", label: "ขาด checklist ทั้งวัน — ครั้งถัดไป", value: rules.checklist.missingDayAfter, unit: "ต่อวัน" },
    { path: "checklist.missingDayEscalateAfter", category: "Checklist", label: "นับกี่ครั้งแรกที่หักเรตแพง", value: rules.checklist.missingDayEscalateAfter, unit: "ครั้ง" },
    { path: "checklist.lateSubmit", category: "Checklist", label: "ส่งช้ากว่าเวลาที่กำหนดของหัวข้อนั้น", value: rules.checklist.lateSubmit, unit: "ต่อหัวข้อ", note: "ส่งได้ถึง 23:59 ของวันนั้น เลยจากนั้นนับเป็นขาดทั้งวัน" },
    { path: "checklist.missingImportant", category: "Checklist", label: "ข้ามข้อสำคัญ", value: rules.checklist.missingImportant, unit: "ต่อข้อ" },
    { path: "checklist.falseRecord", category: "Checklist", label: "สุ่มตรวจแล้วข้อมูลไม่ตรงจริง", value: rules.checklist.falseRecord, unit: "ต่อครั้ง", note: "ติดธง coach 4 สัปดาห์ด้วย" },
    { path: "checklist.backfilled", category: "Checklist", label: "ส่งย้อนหลัง", value: rules.checklist.backfilled, unit: "ต่อครั้ง" },

    { path: "customerService.fixedImmediately", category: "บริการลูกค้า", label: "เคสแรก / แก้ได้ทันที", value: rules.customerService.fixedImmediately, unit: "ต่อเคส" },
    { path: "customerService.repeatedOrSevere", category: "บริการลูกค้า", label: "ซ้ำเรื่องเดิม หรือรุนแรง", value: rules.customerService.repeatedOrSevere, unit: "ต่อเคส", note: "ติดธง coach ด้วย" },

    { path: "assignedWork.lateOneDay", category: "งานที่มอบหมาย", label: "ส่งช้าไม่เกิน 1 วัน", value: rules.assignedWork.lateOneDay, unit: "ต่องาน", note: "เสร็จก่อนกำหนด / ตรงเวลา / แก้แล้วผ่าน = ไม่หัก" },
    { path: "assignedWork.notFinished", category: "งานที่มอบหมาย", label: "ไม่เสร็จเกินกำหนด", value: rules.assignedWork.notFinished, unit: "ต่องาน", note: "ติดธง coach ด้วย" },

    { path: "salary.threshold", category: "หักเงิน", label: "คะแนนรวมต่ำกว่านี้ถึงเริ่มหักเงิน", value: rules.salary.threshold, unit: "คะแนน" },
    { path: "salary.fullTimeRatePerPoint", category: "หักเงิน", label: "Full time — ต่อคะแนนที่ขาด", value: rules.salary.fullTimeRatePerPoint, unit: "บาท" },
    { path: "salary.partTimeDailyRate", category: "หักเงิน", label: "Part time — เรตรายวันที่ใช้คิด", value: rules.salary.partTimeDailyRate, unit: "บาท", note: "หัก = %คะแนนที่ขาด × (วันทำงาน × เรตนี้)" },

    { path: "leave.sickAllowance", category: "วันลา", label: "ลาป่วยต่อปี", value: rules.leave.sickAllowance, unit: "วัน" },
    { path: "leave.personalAllowance", category: "วันลา", label: "ลากิจต่อปี", value: rules.leave.personalAllowance, unit: "วัน" },

    { path: "categoryMax", category: "โครงสร้าง", label: "คะแนนเต็มต่อหมวด (5 หมวด)", value: rules.categoryMax, unit: "คะแนน" }
  ];
}

/** Turns "checklist.lateSubmit" + value into the nested override shape. */
export function overrideFromRows(entries: Array<{ path: string; value: number }>): KpiRulesOverride {
  const override: Record<string, unknown> = {};
  for (const entry of entries) {
    if (!Number.isFinite(entry.value)) continue;
    const [group, key] = entry.path.split(".");
    if (!key) {
      override[group] = entry.value;
      continue;
    }
    const bucket = (override[group] as Record<string, number>) || {};
    bucket[key] = entry.value;
    override[group] = bucket;
  }
  return override as KpiRulesOverride;
}
