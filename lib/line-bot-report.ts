// รายงานผู้ช่วยไลน์ (บอท Golden Baby) — ส่วนคำนวณล้วน ไม่แตะ Firestore เพื่อให้ test ได้.
// บอทเขียน log ลง `line_bot_qa` (คำถาม-คำตอบ) กับ `line_bot_nudges` (ข้อความเตือนเดดไลน์)
// ในโปรเจกต์เดียวกัน หน้านี้อ่านอย่างเดียว.

export const LINE_BOT_QA_COLLECTION = "line_bot_qa";
export const LINE_BOT_NUDGES_COLLECTION = "line_bot_nudges";
/** วันที่บอทเริ่มใช้จริง — ใช้แบ่งช่วง "ก่อนมีบอท / หลังมีบอท" */
export const LINE_BOT_LAUNCH_DATE = "2026-10-05";

export type LineBotQa = {
  id: string;
  who: string;
  staffCode: string | null;
  inGroup: boolean;
  text: string;
  photo: boolean;
  receivedAt: string;
  status: "answered" | "failed" | string;
  answer: string;
  relayedToOwner: boolean;
  answeredAt: string | null;
  responseSec: number | null;
  workDate: string;
};

export type LineBotNudgeKind = "checklist_soon" | "checklist_late" | "assigned_day" | "assigned_2h" | "bot_task_soon";

export type LineBotNudge = {
  id: string;
  who: string;
  staffCode: string | null;
  kind: LineBotNudgeKind | string;
  item: string;
  itemTitle: string;
  workDate: string;
  due: string;
  sentAt: string;
};

/** คนในระบบ SOP — `code` คือคีย์ที่ checklist/KPI ใช้ */
export type LineBotStaffRef = { code: string; label: string; employeeId?: string; names: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export function shiftDay(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00+07:00`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** จำนวนวันแบบนับรวมหัวท้าย */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS) + 1;
}

export type LineBotWindows = {
  /** ช่วงที่เลือก (N วันล่าสุด) */
  from: string;
  to: string;
  /** ส่วนของช่วงที่บอททำงานแล้ว */
  afterFrom: string;
  afterDays: number;
  /** ช่วงยาวเท่ากันก่อนวันเริ่มบอท */
  beforeFrom: string;
  beforeTo: string;
};

export function lineBotWindows(today: string, days: number, launch = LINE_BOT_LAUNCH_DATE): LineBotWindows {
  const from = shiftDay(today, -(days - 1));
  const afterFrom = from > launch ? from : launch;
  const afterDays = today < afterFrom ? 0 : daysBetween(afterFrom, today);
  const beforeTo = shiftDay(launch, -1);
  const beforeFrom = shiftDay(launch, -Math.max(1, afterDays));
  return { from, to: today, afterFrom, afterDays, beforeFrom, beforeTo };
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "45 วิ" / "3 นาที" / "1 ชม. 5 นาที" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  const sec = Math.round(seconds);
  if (sec < 60) return `${sec} วิ`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} นาที`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const norm = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

/** จับคนจาก log บอท → code ใน SOP (เทียบรหัส UP-xxx ก่อน แล้วค่อยเทียบชื่อ). ไม่เจอ = `who:<ชื่อ>` */
export function resolveLineBotPerson(staffCode: string | null, who: string, staff: LineBotStaffRef[]): string {
  const code = norm(staffCode);
  if (code) {
    const hit = staff.find((ref) => norm(ref.employeeId) === code || norm(ref.code) === code);
    if (hit) return hit.code;
  }
  const name = norm(who);
  if (name) {
    const hit = staff.find((ref) => norm(ref.code) === name || ref.names.some((alias) => norm(alias) === name));
    if (hit) return hit.code;
  }
  return `who:${who || staffCode || "ไม่ระบุ"}`;
}

export function personLabel(key: string, staff: LineBotStaffRef[]): string {
  if (key.startsWith("who:")) return key.slice(4);
  return staff.find((ref) => ref.code === key)?.label || key;
}

export type LineBotSummary = {
  questions: number;
  answered: number;
  failed: number;
  relayed: number;
  medianResponseSec: number | null;
  nudges: number;
};

export function summarizeLineBot(qa: LineBotQa[], nudges: LineBotNudge[]): LineBotSummary {
  const answered = qa.filter((row) => row.status === "answered");
  return {
    questions: qa.length,
    answered: answered.length,
    failed: qa.length - answered.length,
    relayed: qa.filter((row) => row.relayedToOwner).length,
    medianResponseSec: median(answered.map((row) => row.responseSec).filter((sec): sec is number => typeof sec === "number")),
    nudges: nudges.length
  };
}

export type ChecklistOutcome = "on_time" | "late";
/** คีย์ `${code}|${workDate}|${phaseId}` → ผลการส่ง checklist หัวข้อนั้น */
export type ChecklistOutcomeMap = Map<string, ChecklistOutcome>;

export function checklistOutcomeKey(code: string, workDate: string, phaseId: string): string {
  return `${code}|${workDate}|${phaseId}`;
}

export type LineBotStaffRow = {
  key: string;
  label: string;
  questions: number;
  nudges: number;
  /** checklist_soon ที่ถึงเวลาแล้ว (ไม่นับอันที่ยังไม่ถึงเดดไลน์) */
  soonNudgesDue: number;
  /** ในจำนวนนั้น ส่งทันเวลา */
  soonNudgesOnTime: number;
  lateBefore: number;
  lateAfter: number;
};

export type LineBotStaffInput = {
  qa: LineBotQa[];
  nudges: LineBotNudge[];
  staff: LineBotStaffRef[];
  outcomes: ChecklistOutcomeMap;
  /** จำนวน checklist ส่งช้าต่อ code — ช่วงก่อนบอท / หลังบอท */
  lateBefore: Map<string, number>;
  lateAfter: Map<string, number>;
  /** เวลาปัจจุบัน (Bangkok) ใช้ตัดเตือนที่ยังไม่ถึงเดดไลน์ */
  todayDate: string;
  nowHHMM: string;
};

export function lineBotStaffRows(input: LineBotStaffInput): LineBotStaffRow[] {
  const rows = new Map<string, LineBotStaffRow>();
  const row = (key: string) => {
    let current = rows.get(key);
    if (!current) {
      current = { key, label: personLabel(key, input.staff), questions: 0, nudges: 0, soonNudgesDue: 0, soonNudgesOnTime: 0, lateBefore: 0, lateAfter: 0 };
      rows.set(key, current);
    }
    return current;
  };

  for (const ref of input.staff) row(ref.code);
  for (const qa of input.qa) row(resolveLineBotPerson(qa.staffCode, qa.who, input.staff)).questions += 1;
  for (const nudge of input.nudges) {
    const target = row(resolveLineBotPerson(nudge.staffCode, nudge.who, input.staff));
    target.nudges += 1;
    if (nudge.kind !== "checklist_soon" || target.key.startsWith("who:")) continue;
    const outcome = input.outcomes.get(checklistOutcomeKey(target.key, nudge.workDate, nudge.item));
    if (outcome === "on_time") {
      target.soonNudgesDue += 1;
      target.soonNudgesOnTime += 1;
      continue;
    }
    // ยังไม่ส่งและยังไม่ถึงเดดไลน์ — ยังตัดสินไม่ได้
    const pending = !outcome && (nudge.workDate > input.todayDate || (nudge.workDate === input.todayDate && nudge.due > input.nowHHMM));
    if (!pending) target.soonNudgesDue += 1;
  }
  for (const [code, count] of input.lateBefore) if (rows.has(code)) row(code).lateBefore = count;
  for (const [code, count] of input.lateAfter) if (rows.has(code)) row(code).lateAfter = count;

  return [...rows.values()]
    .filter((current) => current.questions || current.nudges || current.lateBefore || current.lateAfter || !current.key.startsWith("who:"))
    .sort((a, b) => b.questions + b.nudges - (a.questions + a.nudges) || a.label.localeCompare(b.label, "th"));
}

/** log ล่าสุดก่อน — กรองตามคนได้ */
export function recentLineBotLog(qa: LineBotQa[], staff: LineBotStaffRef[], personKey: string | null, limit = 100): LineBotQa[] {
  return qa
    .filter((row) => !personKey || resolveLineBotPerson(row.staffCode, row.who, staff) === personKey)
    .sort((a, b) => (Date.parse(b.receivedAt) || 0) - (Date.parse(a.receivedAt) || 0))
    .slice(0, limit);
}

/** แปลงเอกสาร Firestore แบบกันพัง — บอทเป็นคนเขียน ฟิลด์อาจขาด */
export function toLineBotQa(id: string, data: Record<string, unknown>): LineBotQa {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id,
    who: str(data.who),
    staffCode: str(data.staffCode) || null,
    inGroup: data.inGroup === true,
    text: str(data.text),
    photo: data.photo === true,
    receivedAt: str(data.receivedAt),
    status: str(data.status) || "failed",
    answer: str(data.answer),
    relayedToOwner: data.relayedToOwner === true,
    answeredAt: str(data.answeredAt) || null,
    responseSec: typeof data.responseSec === "number" && Number.isFinite(data.responseSec) ? data.responseSec : null,
    workDate: str(data.workDate)
  };
}

export function toLineBotNudge(id: string, data: Record<string, unknown>): LineBotNudge {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id,
    who: str(data.who),
    staffCode: str(data.staffCode) || null,
    kind: str(data.kind),
    item: str(data.item),
    itemTitle: str(data.itemTitle),
    workDate: str(data.workDate),
    due: str(data.due),
    sentAt: str(data.sentAt)
  };
}
