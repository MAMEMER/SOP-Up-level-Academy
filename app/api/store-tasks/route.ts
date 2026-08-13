import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";
import { normalizeWorkSpecs, type WorkSpec } from "../../../lib/work-spec.ts";

// Server route for "งานสั่ง" ของร้าน — งานประจำทุกความถี่ (รายวัน / สัปดาห์ / เดือน) อยู่ในลิสต์
// เดียว ตั้งค่าได้เหมือนกันหมด (ดู lib/work-spec.ts). เขียนได้เฉพาะแอดมิน และไม่เขียนตอน
// impersonate — เหมือน route อื่นในระบบ. ตัวตนคนส่งงานมาจาก session เสมอ.
//
//   sop_store_tasks/{branch}          — นิยามงานทั้งหมดของสาขา
//   sop_task_records/{branch}__{date} — ใครส่งงานไหนในวันนั้น (+ คำตอบที่แนบมา)

export const dynamic = "force-dynamic";
const TASKS = "sop_store_tasks";
const RECORDS = "sop_task_records";

type TaskRecord = { by: string; at: string; value?: string; photos?: string[] };

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const recordId = (branch: string, date: string) => `${branch}__${date}`;

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const branch = (p.get("branch") || "").trim();
  const date = (p.get("date") || "").trim();
  if (!branch || branch.includes("/")) return badRequest("missing_branch");

  if (!hasAdminCredentials()) return NextResponse.json({ tasks: [], records: {}, updatedAt: null, updatedBy: null });

  try {
    const [taskSnap, recordSnap] = await Promise.all([
      db().collection(TASKS).doc(branch).get(),
      date && isDate(date) ? db().collection(RECORDS).doc(recordId(branch, date)).get() : Promise.resolve(null)
    ]);
    const data = taskSnap.exists ? (taskSnap.data() as Record<string, unknown>) : {};
    return NextResponse.json({
      tasks: normalizeWorkSpecs(data.tasks),
      records: recordSnap?.exists ? ((recordSnap.data() as { done?: Record<string, TaskRecord> }).done ?? {}) : {},
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

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
