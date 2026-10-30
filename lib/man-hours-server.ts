import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { cardStoreWorkflow } from "./card-store-workflow.ts";
import { applyChecklistConfig, type ChecklistConfig } from "./daily-checklist.ts";
import { normalizeWorkSpecs, scheduleLabel } from "./work-spec.ts";
import { weeklyEvents } from "./weekly-event-tasks.ts";
import { applyEventChecklistOverride, isUnitHidden, normalizeScopeConfig } from "./checklist-overrides.ts";
import { normalizeBranchShiftConfig } from "./branch-shift-config.ts";
import { isWorkingAssignment, type ShiftAssignment } from "./shift-schedule.ts";
import {
  dailyItems,
  eventItems,
  normalizeEstimates,
  normalizeSettings,
  taskItems,
  type ManHourDoc,
  type ManHourItem,
  type ShiftCell
} from "./man-hours.ts";

// อ่านทุกอย่างที่หน้า /admin/man-hours ต้องใช้ในครั้งเดียว: รายการงาน (เช็คลิสต์ + งานสั่ง +
// งานกิจกรรมประจำสัปดาห์) · ค่านาทีที่เจ้าของตั้งไว้ · ชั่วโมงกะของสาขา · ตารางกะของเดือน.

export const MAN_HOURS_COLLECTION = "sop_man_hours";

export type ManHoursData = {
  items: ManHourItem[];
  doc: ManHourDoc;
  workHours: number;
  cells: ShiftCell[];
};

export async function loadManHours(branch: string, month: string): Promise<ManHoursData> {
  const empty: ManHourDoc = { branch, estimates: {}, settings: normalizeSettings(null), updatedAt: null, updatedBy: null };
  if (!hasAdminCredentials()) {
    return { items: dailyItems(cardStoreWorkflow), doc: empty, workHours: normalizeBranchShiftConfig(branch, null).workHours, cells: [] };
  }
  const db = adminDb();
  const [checklistSnap, tasksSnap, eventSnap, shiftCfgSnap, manSnap, cellsSnap] = await Promise.all([
    db.collection("sop_daily_checklist").doc(branch).get(),
    db.collection("sop_store_tasks").doc(branch).get(),
    db.collection("sop_checklist_overrides").doc("weekly-event").get(),
    db.collection("sop_branch_shifts").doc(branch).get(),
    db.collection(MAN_HOURS_COLLECTION).doc(branch).get(),
    db.collection("schedule_shifts").where("branch", "==", branch).where("month", "==", month).get()
  ]);

  const phases = applyChecklistConfig(cardStoreWorkflow, (checklistSnap.data() || {}) as Partial<ChecklistConfig>);
  const specs = normalizeWorkSpecs((tasksSnap.data() || {}).tasks);
  const eventConfig = normalizeScopeConfig(eventSnap.data() as never);
  const events = weeklyEvents
    .filter((event) => !isUnitHidden(eventConfig, event.id))
    .map((event) => ({
      key: event.key,
      name: event.name,
      activeDays: event.activeDays,
      items: applyEventChecklistOverride(event.checklist, eventConfig.overrides[event.id]).map((item) => item.title)
    }));

  const items = [...dailyItems(phases), ...taskItems(specs, (spec) => scheduleLabel(spec.schedule)), ...eventItems(events)];

  const raw = manSnap.data() || {};
  const doc: ManHourDoc = {
    branch,
    estimates: normalizeEstimates(raw.estimates),
    settings: normalizeSettings(raw.settings),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null
  };

  const cells: ShiftCell[] = [];
  for (const snap of cellsSnap.docs) {
    const data = snap.data() as { staffCode?: string; workDate?: string; assignment?: ShiftAssignment };
    if (data.staffCode && data.workDate && data.assignment && isWorkingAssignment(data.assignment)) {
      cells.push({ staffCode: data.staffCode, workDate: data.workDate, shift: data.assignment });
    }
  }

  return { items, doc, workHours: normalizeBranchShiftConfig(branch, shiftCfgSnap.data()).workHours, cells };
}
