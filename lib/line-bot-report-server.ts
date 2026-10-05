import "server-only";
import { fetchChecklistKpiInput } from "./checklist-kpi.ts";
import { employeeCodeForEmail } from "./employee-directory.ts";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { listStaff } from "./staff-store.ts";
import { listAllRecordsInScopeRange } from "./work-records-store.ts";
import { dailyScopeKey } from "./work-records.ts";
import { isWorkflowRecordOnTime, type WorkflowDayPayload } from "./workflow-records.ts";
import {
  LINE_BOT_NUDGES_COLLECTION,
  LINE_BOT_QA_COLLECTION,
  checklistOutcomeKey,
  lineBotStaffRows,
  lineBotWindows,
  summarizeLineBot,
  toLineBotNudge,
  toLineBotQa,
  type ChecklistOutcomeMap,
  type LineBotQa,
  type LineBotStaffRef,
  type LineBotStaffRow,
  type LineBotSummary,
  type LineBotWindows
} from "./line-bot-report.ts";

// โหลดข้อมูลให้หน้า /admin/line-bot — log บอท (อ่านอย่างเดียว) + checklist ที่ส่งจริง

export type LineBotReport = {
  windows: LineBotWindows;
  summary: LineBotSummary;
  staffRows: LineBotStaffRow[];
  staff: LineBotStaffRef[];
  qa: LineBotQa[];
};

function bangkokNow() {
  const iso = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}

async function byWorkDate(collection: string, from: string, to: string) {
  const snap = await adminDb().collection(collection).where("workDate", ">=", from).where("workDate", "<=", to).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
}

/** ผลส่ง checklist รายหัวข้อ (ทัน/ช้า) ในช่วง — เกณฑ์เดียวกับ KPI (isWorkflowRecordOnTime) */
async function checklistOutcomes(from: string, to: string): Promise<ChecklistOutcomeMap> {
  const outcomes: ChecklistOutcomeMap = new Map();
  const docs = await listAllRecordsInScopeRange(dailyScopeKey(from), dailyScopeKey(to));
  for (const doc of docs) {
    if (doc.scope !== "daily") continue;
    const code = employeeCodeForEmail(doc.employeeEmail);
    if (!code) continue;
    const records = (doc.data as Partial<WorkflowDayPayload>)?.records || [];
    for (const record of records) {
      if (record.status !== "submitted") continue;
      outcomes.set(checklistOutcomeKey(code, record.workDate, record.phaseId), isWorkflowRecordOnTime(record) ? "on_time" : "late");
    }
  }
  return outcomes;
}

async function lateCounts(from: string, to: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { lateSubmissions } = await fetchChecklistKpiInput("", from, to);
  for (const late of lateSubmissions) counts.set(late.employeeName, (counts.get(late.employeeName) || 0) + 1);
  return counts;
}

export async function getLineBotReport(days: number): Promise<LineBotReport> {
  if (!hasAdminCredentials()) throw new Error("ยังไม่ได้ตั้งค่า Firebase บนเซิร์ฟเวอร์ — อ่าน log บอทไม่ได้");
  const now = bangkokNow();
  const windows = lineBotWindows(now.date, days);

  const [qaDocs, nudgeDocs, staffRecords, outcomes, lateBefore, lateAfter] = await Promise.all([
    byWorkDate(LINE_BOT_QA_COLLECTION, windows.from, windows.to),
    byWorkDate(LINE_BOT_NUDGES_COLLECTION, windows.from, windows.to),
    listStaff(),
    checklistOutcomes(windows.from, windows.to),
    lateCounts(windows.beforeFrom, windows.beforeTo),
    windows.afterDays ? lateCounts(windows.afterFrom, windows.to) : Promise.resolve(new Map<string, number>())
  ]);

  const staff: LineBotStaffRef[] = staffRecords
    .filter((record) => record.active && record.onRoster && record.code)
    .map((record) => ({
      code: record.code,
      label: record.displayName || record.name || record.code,
      employeeId: record.employeeId,
      names: [record.name, record.displayName, ...(record.aliases || [])].filter(Boolean)
    }));
  const qa = qaDocs.map((doc) => toLineBotQa(doc.id, doc.data));
  const nudges = nudgeDocs.map((doc) => toLineBotNudge(doc.id, doc.data));

  return {
    windows,
    summary: summarizeLineBot(qa, nudges),
    staffRows: lineBotStaffRows({ qa, nudges, staff, outcomes, lateBefore, lateAfter, todayDate: now.date, nowHHMM: now.hhmm }),
    staff,
    qa
  };
}
