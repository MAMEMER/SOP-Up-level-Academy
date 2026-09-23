import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";
import { normalizeWorkSpecs, type WorkSpec } from "../../../lib/work-spec.ts";
import { normalizeScopeConfig, type ChecklistScopeConfig } from "../../../lib/checklist-overrides.ts";
import { scopeForPeriod, type PeriodicPeriod } from "../../../lib/periodic-tasks.ts";
import { mergeImportedSpecs, specsFromPeriod } from "../../../lib/task-import.ts";
import {
  applyProgressAction,
  clampPercent,
  normalizeProgressMap,
  periodKeyForSchedule,
  progressKey,
  pruneProgressMap,
  type TaskProgressAction,
  type TaskProgressEntry
} from "../../../lib/task-progress.ts";

// Server route for "งานสั่ง" ของร้าน — งานประจำทุกความถี่ (รายวัน / สัปดาห์ / เดือน) อยู่ในลิสต์
// เดียว ตั้งค่าได้เหมือนกันหมด (ดู lib/work-spec.ts). เขียนได้เฉพาะแอดมิน และไม่เขียนตอน
// impersonate — เหมือน route อื่นในระบบ. ตัวตนคนส่งงานมาจาก session เสมอ.
//
//   sop_store_tasks/{branch}          — นิยามงานทั้งหมดของสาขา
//   sop_task_records/{branch}__{date} — ใครส่งงานไหนในวันนั้น (+ คำตอบที่แนบมา)
//   sop_task_progress/{branch}        — ความคืบหน้าของงานที่ยังทำไม่เสร็จ (งาน+รอบ → %, ไทม์ไลน์)
//
// ความคืบหน้าเก็บ "ต่อรอบของงาน" ไม่ใช่ต่อวัน (ดู lib/task-progress.ts) เพราะงานรายสัปดาห์
// เริ่มวันจันทร์แล้วทำต่อวันอังคารเป็นงานชิ้นเดียวกัน. ตอนกดเสร็จยังเขียน `done` ของวันนั้น
// เหมือนเดิมทุกอย่าง — KPI / หน้ารีวิว ที่อ่าน done อยู่แล้วจึงไม่ต้องแก้.

export const dynamic = "force-dynamic";
const TASKS = "sop_store_tasks";
const RECORDS = "sop_task_records";
const PROGRESS = "sop_task_progress";
const CHECKLIST_OVERRIDES = "sop_checklist_overrides";

type TaskRecord = { by: string; at: string; value?: string; photos?: string[] };

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const recordId = (branch: string, date: string) => `${branch}__${date}`;

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const branch = (p.get("branch") || "").trim();
  const date = (p.get("date") || "").trim();
  if (!branch || branch.includes("/")) return badRequest("missing_branch");

  if (!hasAdminCredentials())
    return NextResponse.json({ tasks: [], records: {}, progress: {}, updatedAt: null, updatedBy: null });

  try {
    const [taskSnap, recordSnap, progressSnap] = await Promise.all([
      db().collection(TASKS).doc(branch).get(),
      date && isDate(date) ? db().collection(RECORDS).doc(recordId(branch, date)).get() : Promise.resolve(null),
      db().collection(PROGRESS).doc(branch).get()
    ]);
    const data = taskSnap.exists ? (taskSnap.data() as Record<string, unknown>) : {};
    return NextResponse.json({
      tasks: normalizeWorkSpecs(data.tasks),
      records: recordSnap?.exists ? ((recordSnap.data() as { done?: Record<string, TaskRecord> }).done ?? {}) : {},
      progress: progressSnap.exists ? normalizeProgressMap((progressSnap.data() as { entries?: unknown }).entries) : {},
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null
    });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const branch = typeof body.branch === "string" ? body.branch.trim() : "";
  if (!branch || branch.includes("/")) return badRequest("missing_branch");
  const nowIso = new Date().toISOString();

  try {
    switch (body.action) {
      // ── เจ้าของบันทึกลิสต์งานทั้งหมด ────────────────────────────────────────
      case "saveTasks": {
        if (!isAdmin(user)) return forbidden();
        const tasks: WorkSpec[] = normalizeWorkSpecs(body.tasks);
        await db().collection(TASKS).doc(branch).set({ branch, tasks, updatedAt: nowIso, updatedBy: user.actualEmail });
        return NextResponse.json({ ok: true, tasks, updatedAt: nowIso, updatedBy: user.actualEmail });
      }

      // ── ย้ายรายการ checklist สัปดาห์/เดือน ของเดิมเข้ามา (กดซ้ำได้ ไม่ซ้ำงาน) ─────
      case "importLegacy": {
        if (!isAdmin(user)) return forbidden();
        const taskSnap = await db().collection(TASKS).doc(branch).get();
        const existing = normalizeWorkSpecs(taskSnap.exists ? (taskSnap.data() as { tasks?: unknown }).tasks : []);
        const periods: PeriodicPeriod[] = ["weekly", "monthly"];
        const incoming: WorkSpec[] = [];
        for (const period of periods) {
          const snap = await db().collection(CHECKLIST_OVERRIDES).doc(scopeForPeriod(period)).get();
          const config = normalizeScopeConfig((snap.exists ? snap.data() : {}) as Partial<ChecklistScopeConfig>);
          incoming.push(...specsFromPeriod(period, config, incoming.length));
        }
        const { tasks, added } = mergeImportedSpecs(existing, incoming);
        if (added > 0) {
          await db().collection(TASKS).doc(branch).set({ branch, tasks, updatedAt: nowIso, updatedBy: user.actualEmail });
          // ปักธงไว้ที่ scope เดิม เพื่อไม่ให้พนักงานเจอรายการเดียวกันสองที่
          await Promise.all(
            periods.map((period) =>
              db().collection(CHECKLIST_OVERRIDES).doc(scopeForPeriod(period)).set({ migratedToTasks: true }, { merge: true })
            )
          );
        }
        return NextResponse.json({ ok: true, tasks, added, updatedAt: nowIso, updatedBy: user.actualEmail });
      }

      // ── พนักงานส่งงานของวันนั้น (ติ๊ก / พร้อมคำตอบที่เจ้าของสั่งให้กรอก) ─────
      case "submitTask": {
        const date = typeof body.date === "string" ? body.date : "";
        const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
        if (!isDate(date) || !taskId) return badRequest("missing_params");
        const ref = db().collection(RECORDS).doc(recordId(branch, date));
        const snap = await ref.get();
        const done: Record<string, TaskRecord> = snap.exists
          ? { ...((snap.data() as { done?: Record<string, TaskRecord> }).done ?? {}) }
          : {};
        if (body.done === false) {
          delete done[taskId];
        } else {
          // คำตอบถูกเรนเดอร์ให้คนอื่นอ่าน/กด — ตัดความยาว และรับเฉพาะ URL ที่ปลอดภัย
          const value = typeof body.value === "string" ? body.value.trim().slice(0, 500) : "";
          const photos = Array.isArray(body.photos)
            ? body.photos.filter((url): url is string => typeof url === "string" && isValidLinkUrl(url)).slice(0, 3)
            : [];
          done[taskId] = {
            by: staffCode || user.actualEmail,
            at: nowIso,
            ...(value ? { value } : {}),
            ...(photos.length ? { photos } : {})
          };
        }
        await ref.set({ branch, date, done, updatedAt: nowIso }, { merge: true });
        return NextResponse.json({ done });
      }

      // ── พนักงานลงความคืบหน้า: เริ่มทำ / อัพเดท % / ติดปัญหา / เสร็จ ─────────
      case "progressTask": {
        const date = typeof body.date === "string" ? body.date : "";
        const taskId = typeof body.taskId === "string" ? body.taskId.trim().slice(0, 120) : "";
        const action = typeof body.progress === "string" ? (body.progress as TaskProgressAction) : "";
        const allowed: TaskProgressAction[] = ["start", "update", "stuck", "resume", "finish", "reopen", "clear"];
        if (!isDate(date) || !taskId || !allowed.includes(action as TaskProgressAction))
          return badRequest("missing_params");

        // รอบของงานคำนวณฝั่ง server จากนิยามงานจริง — client ส่งมาเองไม่ได้
        const taskSnap = await db().collection(TASKS).doc(branch).get();
        const specs = normalizeWorkSpecs(taskSnap.exists ? (taskSnap.data() as { tasks?: unknown }).tasks : []);
        const spec = specs.find((item) => item.id === taskId);
        const periodKey = spec ? periodKeyForSchedule(spec.schedule, date) : date;
        const key = progressKey(taskId, periodKey);

        const value = typeof body.value === "string" ? body.value.trim().slice(0, 500) : "";
        const photos = Array.isArray(body.photos)
          ? body.photos.filter((url): url is string => typeof url === "string" && isValidLinkUrl(url)).slice(0, 3)
          : [];
        const by = staffCode || user.actualEmail;

        const progressRef = db().collection(PROGRESS).doc(branch);
        const progressSnap = await progressRef.get();
        const entries: Record<string, TaskProgressEntry> = progressSnap.exists
          ? normalizeProgressMap((progressSnap.data() as { entries?: unknown }).entries)
          : {};
        const next = applyProgressAction(entries[key], {
          action: action as TaskProgressAction,
          by,
          at: nowIso,
          percent: body.percent === undefined ? undefined : clampPercent(body.percent, 0),
          note: typeof body.note === "string" ? body.note.slice(0, 400) : undefined,
          photos
        });
        if (next) entries[key] = next;
        else delete entries[key];

        await progressRef.set(
          { branch, entries: pruneProgressMap(entries), updatedAt: nowIso, updatedBy: by },
          { merge: false }
        );

        // กดเสร็จ = ส่งงานของวันนั้นด้วย (KPI และหน้ารีวิวอ่านจาก `done` เหมือนเดิม)
        const recordRef = db().collection(RECORDS).doc(recordId(branch, date));
        const recordSnap = await recordRef.get();
        const done: Record<string, TaskRecord> = recordSnap.exists
          ? { ...((recordSnap.data() as { done?: Record<string, TaskRecord> }).done ?? {}) }
          : {};
        if (action === "finish") {
          done[taskId] = {
            by,
            at: nowIso,
            ...(value ? { value } : {}),
            ...(photos.length ? { photos } : {})
          };
        } else if (action === "reopen" || action === "clear") {
          delete done[taskId];
        }
        if (action === "finish" || action === "reopen" || action === "clear") {
          await recordRef.set({ branch, date, done, updatedAt: nowIso }, { merge: true });
        }

        return NextResponse.json({ done, progress: entries });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
