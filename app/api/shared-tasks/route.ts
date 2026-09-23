import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, readOnly } from "../../../lib/api-firestore.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";
import {
  applyProgressAction,
  clampPercent,
  normalizeProgressMap,
  type TaskProgressAction,
  type TaskProgressEntry
} from "../../../lib/task-progress.ts";

// Server route for the shared weekly/monthly checklist ticks (fix 1). Replaces the client
// store (lib/shared-tasks-store.ts). Read + tick: any signed-in staffer (the whole team
// finishes the list together), never while impersonating. The "by" stamp comes from the
// session, and the toggle is applied server-side (read-modify-write) so one browser cannot
// clobber another's ticks by posting a stale map.

export const dynamic = "force-dynamic";
const SHARED = "sop_shared_tasks";

/** `value` / `photos` = คำตอบที่เจ้าของสั่งให้กรอกตอนติ๊ก (ดู lib/checklist-overrides ItemAnswer) */
type SharedTick = { by: string; at: string; value?: string; photos?: string[] };

const docId = (branch: string, period: string, periodKey: string) => `${branch}__${period}__${periodKey}`;

function isPeriod(v: unknown): v is "weekly" | "monthly" {
  return v === "weekly" || v === "monthly";
}

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const branch = p.get("branch") || "";
  const period = p.get("period") || "";
  const periodKey = p.get("periodKey") || "";
  if (!branch || !isPeriod(period) || !periodKey) return badRequest("missing_params");
  try {
    const snap = await db().collection(SHARED).doc(docId(branch, period, periodKey)).get();
    const data = snap.exists ? (snap.data() as { ticks?: Record<string, SharedTick>; progress?: unknown }) : {};
    return NextResponse.json({ ticks: data.ticks ?? {}, progress: normalizeProgressMap(data.progress) });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();

  const body = (await request.json().catch(() => null)) as
    | {
        branch?: string;
        period?: string;
        periodKey?: string;
        taskId?: string;
        ticked?: boolean;
        value?: unknown;
        photos?: unknown;
        progress?: unknown;
        percent?: unknown;
        note?: unknown;
      }
    | null;
  if (!body || !body.branch || !isPeriod(body.period) || !body.periodKey || !body.taskId)
    return badRequest("missing_params");
  // คีย์ของรายการเก็บเป็นชื่อฟิลด์ใน map — ตัดความยาวกันเอกสารโตผิดปกติ
  body.taskId = String(body.taskId).slice(0, 120);

  const nowIso = new Date().toISOString();
  const by = staffCode || user.name || user.actualEmail;
  const ref = db().collection(SHARED).doc(docId(body.branch, body.period, body.periodKey));
  try {
    const snap = await ref.get();
    const stored = snap.exists ? (snap.data() as { ticks?: Record<string, SharedTick>; progress?: unknown }) : {};
    const ticks: Record<string, SharedTick> = { ...(stored.ticks ?? {}) };
    const progress: Record<string, TaskProgressEntry> = normalizeProgressMap(stored.progress);
    // คำตอบที่แนบมากับการติ๊ก: ตัดความยาว และรับเฉพาะ URL รูปที่ปลอดภัย (กัน javascript: หลุดไป
    // เป็นลิงก์ให้คนอื่นกด) — ส่วนจะ "ต้องกรอกไหม" หน้าจอเป็นคนบังคับตามที่เจ้าของตั้งไว้
    const value = typeof body.value === "string" ? body.value.trim().slice(0, 500) : "";
    const photos = Array.isArray(body.photos)
      ? body.photos.filter((url): url is string => typeof url === "string" && isValidLinkUrl(url)).slice(0, 3)
      : [];
    // ลงความคืบหน้า: เริ่มทำ / อัพเดท % / ติดปัญหา / เสร็จ — กดเสร็จยังติ๊ก ticks เหมือนเดิม
    // เพื่อให้ทุกหน้าจอที่นับ "เสร็จกี่ข้อ" อยู่แล้วไม่ต้องแก้
    const allowed: TaskProgressAction[] = ["start", "update", "stuck", "resume", "finish", "reopen", "clear"];
    const action = typeof body.progress === "string" ? (body.progress as TaskProgressAction) : null;
    if (action) {
      if (!allowed.includes(action)) return badRequest("unknown_progress_action");
      const next = applyProgressAction(progress[body.taskId], {
        action,
        by,
        at: nowIso,
        percent: body.percent === undefined ? undefined : clampPercent(body.percent, 0),
        note: typeof body.note === "string" ? body.note.slice(0, 400) : undefined,
        photos
      });
      if (next) progress[body.taskId] = next;
      else delete progress[body.taskId];
      if (action === "finish")
        ticks[body.taskId] = { by, at: nowIso, ...(value ? { value } : {}), ...(photos.length ? { photos } : {}) };
      if (action === "reopen" || action === "clear") delete ticks[body.taskId];
    } else if (body.ticked) {
      ticks[body.taskId] = { by, at: nowIso, ...(value ? { value } : {}), ...(photos.length ? { photos } : {}) };
    } else {
      delete ticks[body.taskId];
      delete progress[body.taskId];
    }
    // เขียนทับทั้งเอกสาร (ไม่ merge) — เอกสารนี้มีแค่ฟิลด์ที่เขียนอยู่นี้ และ merge แบบ deep
    // จะไม่ลบคีย์ที่หายไปออกจาก map ทำให้ "ยกเลิกติ๊ก" ไม่มีผลจริง
    await ref.set({ branch: body.branch, period: body.period, periodKey: body.periodKey, ticks, progress, updatedAt: nowIso });
    return NextResponse.json({ ticks, progress });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
