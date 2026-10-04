import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  MAX_PROJECT_PROGRESS,
  WORK_PROJECTS_COLLECTION,
  addDays,
  clampPercent,
  isIsoDate,
  projectMode,
  validateProgressInput,
  validateProjectDraft,
  type ProjectHistoryEntry,
  type ProjectProgress,
  type ProjectStatus,
  type WorkProject
} from "../../../lib/work-projects.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";
import { normalizeItemAnswer } from "../../../lib/checklist-overrides.ts";
import { isHhMm } from "../../../lib/work-spec.ts";
import {
  computeReviewPoints,
  effectiveDue,
  hasOpenRevision,
  reviewEntriesFor,
  splitReviewByOwner
} from "../../../lib/project-review.ts";
import { applyHandover, currentOwnerOf, handoverSummary, validateHandover } from "../../../lib/project-handover.ts";
import { fetchShiftAssignmentsForDate } from "../../../lib/shift-plan-server.ts";
import type { ProjectReviewEntry, TaskSubmission, TrackMode } from "../../../lib/work-projects.ts";
import { TRACK_MODES, amountDone, everyoneDone, lastSubmissionFor, trackModeOf, validateSubmission, validateTrack } from "../../../lib/task-inbox.ts";
import { computeWorkDayDates } from "../../../lib/task-workdays-server.ts";

// Server route for งานแบบโปรเจกต์ (หลายวัน + ส่ง progress รายวัน). Same shape as
// /api/work-tasks: session-verified, blocked while impersonating, Admin SDK does the write,
// and the acting identity always comes from the session — never from the request body.
//  - สร้าง / แก้วัน / เพิ่ม-ลดคน / ปิดงาน / ลบ  → แอดมินเท่านั้น
//  - เพิ่ม progress                          → คนที่ถูกมอบหมาย (หรือแอดมิน) เท่านั้น

export const dynamic = "force-dynamic";

function newId(iso: string, title: string): string {
  return `wp__${iso}__${title}`.replace(/[^a-zA-Z0-9_:\-.]/g, "-").slice(0, 140);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
/**
 * Document ids come from the request body, and Firestore treats "a/b/c" as a PATH — an id with
 * a slash would read/write outside this collection. Ids we mint never contain one, so anything
 * that does is rejected outright.
 */
const docId = (v: unknown) => {
  const value = str(v).trim();
  return value && !value.includes("/") ? value : "";
};
/** เวลาเริ่ม/จบ ที่ผ่านการตรวจรูปแบบแล้วเท่านั้น — เวลาเพี้ยนจะไปล็อกไม่ให้พนักงานส่งงาน */
function timingFromBody(body: Record<string, unknown>) {
  const openTime = typeof body.openTime === "string" && isHhMm(body.openTime) ? body.openTime : undefined;
  const dueTime = typeof body.dueTime === "string" && isHhMm(body.dueTime) ? body.dueTime : undefined;
  if (!openTime && !dueTime) return undefined;
  return { ...(openTime ? { openTime } : {}), ...(dueTime ? { dueTime } : {}) };
}

function answerFromBody(body: Record<string, unknown>) {
  return normalizeItemAnswer(body.answer as never);
}

const strArr = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))) : []);
const safeUrls = (v: unknown) => strArr(v).filter((url) => isValidLinkUrl(url));

/** คะแนนที่เจ้าของใส่เอง (−50…+20) — ไม่ส่งมา/ไม่ใช่ตัวเลข = ใช้ค่าที่ระบบคิดให้ */
function reviewPointsOverride(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(-50, Math.min(20, n));
}

/** วิธีนับความคืบหน้าที่เจ้าของเลือก — ค่าเพี้ยนไม่รับ (คืน {} = งานแบบเดิม) */
function trackFromBody(body: Record<string, unknown>): { trackMode?: TrackMode; workDays?: number; targetAmount?: number; unit?: string } {
  const mode = TRACK_MODES.includes(body.trackMode as TrackMode) ? (body.trackMode as TrackMode) : undefined;
  if (!mode) return {};
  const workDays = Math.round(Number(body.workDays));
  const targetAmount = Number(body.targetAmount);
  const unit = str(body.unit).trim().slice(0, 20);
  return {
    trackMode: mode,
    ...(mode === "workdays" ? { workDays } : {}),
    ...(mode === "amount" ? { targetAmount, ...(unit ? { unit } : {}) } : {})
  };
}

/**
 * งานแบบนับวันทำงาน: วันส่ง = วันทำงานที่ N ตามตารางกะ. ตารางกะเปลี่ยน (เพิ่มกะ/ลา) → คำนวณใหม่
 * ตอนโหลด แล้วเขียนกลับเฉพาะงานที่ยังทำอยู่และยังไม่มีใครส่ง (งานที่ส่ง/ตรวจแล้วกำหนดต้องนิ่ง).
 */
async function refreshWorkdays(projects: WorkProject[]): Promise<WorkProject[]> {
  return Promise.all(
    projects.map(async (project) => {
      if (trackModeOf(project) !== "workdays" || project.status !== "active" || !project.workDays) return project;
      if ((project.submissions || []).length || (project.reviews || []).length) return project;
      try {
        const dates = await computeWorkDayDates(project.assignees, project.startDate, project.workDays);
        const endDate = dates[dates.length - 1] || project.endDate;
        if (endDate === project.endDate && dates.join() === (project.workDayDates || []).join()) return project;
        await db().collection(WORK_PROJECTS_COLLECTION).doc(project.id).update({ endDate, workDayDates: dates });
        return { ...project, endDate, workDayDates: dates };
      } catch {
        return project;
      }
    })
  );
}

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const action = p.get("action");
  const branch = p.get("branch") || "";

  // Dev preview (no service account) has no Firestore — return empty instead of 500.
  if (!hasAdminCredentials()) {
    return NextResponse.json(action === "projectById" ? { project: null } : { projects: [] });
  }

  try {
    switch (action) {
      case "projectsForBranch": {
        if (!branch) return badRequest("missing_branch");
        const snap = await db().collection(WORK_PROJECTS_COLLECTION).where("branch", "==", branch).get();
        return NextResponse.json({ projects: await refreshWorkdays(snap.docs.map((d) => d.data() as WorkProject)) });
      }
      case "projectsForStaff": {
        const staffCode = p.get("staffCode") || "";
        if (!staffCode) return badRequest("missing_params");
        // array-contains + equality on another field ต้องมี composite index — เดิม query คู่กับ
        // branch เลยพังเงียบๆ (500) แล้วหน้าพนักงานขึ้นว่า "ยังไม่มีงาน". ใช้ index ตัวเดียวที่
        // Firestore สร้างให้เองแล้วกรอง branch ในโค้ด — ไม่ต้อง deploy index
        const snap = await db()
          .collection(WORK_PROJECTS_COLLECTION)
          .where("assignees", "array-contains", staffCode)
          .get();
        // ไม่กรองสาขาที่นี่: ถ้าเจ้าของมอบหมายชื่อคุณไว้ คุณต้องเห็น — สาขาในโปรไฟล์พนักงานกับสาขา
        // ที่ตอนสั่งงานไม่ตรงกัน ไม่ควรทำให้งานหายไปเงียบๆ
        return NextResponse.json({ projects: await refreshWorkdays(snap.docs.map((d) => d.data() as WorkProject)) });
      }
      case "projectById": {
        const id = (p.get("id") || "").trim();
        if (!id || id.includes("/")) return badRequest("missing_id");
        const snap = await db().collection(WORK_PROJECTS_COLLECTION).doc(id).get();
        return NextResponse.json({ project: snap.exists ? (snap.data() as WorkProject) : null });
      }
      // ── ใครควรเป็นคนรับงานต่อ: คนที่ลงกะไว้ในวันถัดไป (ทั้งกะเปิดและกะปิด) ───────
      // ยังไม่ได้วางกะของวันนั้น → คืนลิสต์ว่าง แล้วให้ UI ถอยไปใช้รายชื่อทีมทั้งสาขา
      case "handoverCandidates": {
        if (!branch) return badRequest("missing_branch");
        const from = isIsoDate(p.get("date")) ? (p.get("date") as string) : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
        const nextDay = addDays(from, 1);
        const shifts = await fetchShiftAssignmentsForDate(branch, nextDay);
        const candidates = shifts ? [...shifts.entries()].map(([staffCode, shift]) => ({ staffCode, shift })) : [];
        return NextResponse.json({ date: nextDay, candidates });
      }
      default:
        return badRequest("unknown_action");
    }
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
  const nowIso = new Date().toISOString();

  async function load(id: string): Promise<WorkProject | NextResponse> {
    const snap = await db().collection(WORK_PROJECTS_COLLECTION).doc(id).get();
    if (!snap.exists) return badRequest("not_found");
    return snap.data() as WorkProject;
  }

  function stamp(project: WorkProject, entry: Omit<ProjectHistoryEntry, "at" | "by">): ProjectHistoryEntry[] {
    return [...(project.history || []), { at: nowIso, by: user.actualEmail, ...entry }].slice(-100);
  }

  try {
    switch (body.action) {
      // ── เจ้าของสร้างโปรเจกต์ ────────────────────────────────────────────────
      case "createProject": {
        if (!isAdmin(user)) return forbidden();
        const draft = {
          title: str(body.title).trim(),
          detail: str(body.detail).trim(),
          expectedResult: str(body.expectedResult).trim(),
          startDate: str(body.startDate),
          endDate: str(body.endDate),
          assignees: strArr(body.assignees)
        };
        const invalid = validateProjectDraft(draft);
        if (invalid) return badRequest(invalid);
        const track = trackFromBody(body);
        const invalidTrack = validateTrack(track);
        if (invalidTrack) return badRequest(invalidTrack);
        // ให้เวลา N วันทำงาน → วันส่ง = วันทำงานที่ N ตามตารางกะของคนที่ได้รับงาน
        let workDayDates: string[] | undefined;
        if (track.trackMode === "workdays" && track.workDays) {
          workDayDates = await computeWorkDayDates(draft.assignees, draft.startDate, track.workDays);
          draft.endDate = workDayDates[workDayDates.length - 1] || draft.startDate;
        }
        const parentId = docId(body.parentId);
        const parentSnap = parentId ? await db().collection(WORK_PROJECTS_COLLECTION).doc(parentId).get() : null;
        if (parentId && !parentSnap?.exists) return badRequest("ไม่พบงานใหญ่ที่จะเพิ่มงานย่อย");
        const parentTitle = parentSnap?.exists ? String((parentSnap.data() as WorkProject).title || "") : "";
        const id = newId(nowIso, `${draft.title}-${draft.assignees.join("-")}`);
        const project: WorkProject = {
          id,
          branch: str(body.branch) || "bangkae",
          title: draft.title,
          ...(draft.detail ? { detail: draft.detail } : {}),
          ...(draft.expectedResult ? { expectedResult: draft.expectedResult } : {}),
          startDate: draft.startDate,
          endDate: draft.endDate,
          assignees: draft.assignees,
          status: "active",
          // เดี่ยว/กลุ่ม + เวลา + วิธีส่งงาน — ฟิลด์ชุดเดียวกับงานประจำ (lib/work-spec.ts)
          mode: body.mode === "group" ? "group" : "single",
          ...(timingFromBody(body) ? { timing: timingFromBody(body) } : {}),
          ...(answerFromBody(body) ? { answer: answerFromBody(body) } : {}),
          ...track,
          ...(workDayDates ? { workDayDates } : {}),
          ...(parentId ? { parentId, parentTitle } : {}),
          // ผู้รับผิดชอบคนแรก = คนแรกในรายชื่อ (งานกลุ่มก็ยังต้องมีคนถือ ไว้ใช้ตอนส่งต่อ/คิด KPI)
          originalOwner: draft.assignees[0],
          currentOwner: draft.assignees[0],
          createdBy: user.actualEmail,
          createdAt: nowIso,
          updatedAt: nowIso,
          progress: [],
          history: [{ at: nowIso, by: user.actualEmail, action: "created", detail: `${draft.startDate} → ${draft.endDate}` }]
        };
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).set(project);
        return NextResponse.json({ ok: true, id });
      }

      // ── เจ้าของยืด/ลดเวลา ──────────────────────────────────────────────────
      case "updateProjectDates": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const startDate = str(body.startDate);
        const endDate = str(body.endDate);
        if (!id || !isIsoDate(startDate) || !isIsoDate(endDate)) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        let finalEnd = endDate;
        let workPatch: { workDays?: number; workDayDates?: string[] } = {};
        if (trackModeOf(project) === "workdays") {
          // งานนับวันทำงาน: เจ้าของปรับ "จำนวนวัน" แล้ววันส่งคำนวณจากตารางกะใหม่
          const workDays = Math.max(1, Math.min(60, Math.round(Number(body.workDays)) || project.workDays || 1));
          const dates = await computeWorkDayDates(project.assignees, startDate, workDays);
          finalEnd = dates[dates.length - 1] || startDate;
          workPatch = { workDays, workDayDates: dates };
        }
        const invalid = validateProjectDraft({ ...project, startDate, endDate: finalEnd });
        if (invalid) return badRequest(invalid);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          startDate,
          endDate: finalEnd,
          ...workPatch,
          updatedAt: nowIso,
          history: stamp(project, {
            action: "dates",
            detail: `${project.startDate} → ${project.endDate} เป็น ${startDate} → ${finalEnd}`
          })
        });
        return NextResponse.json({ ok: true });
      }

      // ── เจ้าของเพิ่ม/ลดคนช่วย ──────────────────────────────────────────────
      case "updateProjectAssignees": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const assignees = strArr(body.assignees);
        if (!id) return badRequest("missing_id");
        if (assignees.length === 0) return badRequest("ต้องเหลือผู้รับผิดชอบอย่างน้อย 1 คน");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        // ถอดคนที่ถืองานอยู่ออก → ยกงานให้คนแรกที่เหลือ ไม่งั้นงานจะไม่มีเจ้าของและส่งต่อไม่ได้
        const owner = currentOwnerOf(project);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          assignees,
          ...(assignees.includes(owner) ? {} : { currentOwner: assignees[0] }),
          updatedAt: nowIso,
          history: stamp(project, { action: "assignees", detail: `${project.assignees.join(", ")} เป็น ${assignees.join(", ")}` })
        });
        return NextResponse.json({ ok: true });
      }

      // ── เจ้าของแก้รายละเอียดงาน ─────────────────────────────────────────────
      case "updateProjectDetail": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const title = str(body.title).trim();
        if (!id || !title) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          title,
          detail: str(body.detail).trim(),
          expectedResult: str(body.expectedResult).trim(),
          ...(body.mode ? { mode: body.mode === "group" ? "group" : "single" } : {}),
          ...(timingFromBody(body) ? { timing: timingFromBody(body) } : {}),
          ...(answerFromBody(body) ? { answer: answerFromBody(body) } : {}),
          updatedAt: nowIso,
          history: stamp(project, { action: "detail", detail: title })
        });
        return NextResponse.json({ ok: true });
      }

      // ── เจ้าของปิด/ยกเลิก/เปิดงานใหม่ ───────────────────────────────────────
      case "setProjectStatus": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const status = str(body.status) as ProjectStatus;
        if (!id || !["active", "done", "cancelled"].includes(status)) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          status,
          updatedAt: nowIso,
          history: stamp(project, { action: "status", detail: `${project.status} → ${status}` })
        });
        return NextResponse.json({ ok: true });
      }

      // ── สลับ เดี่ยว/กลุ่ม ────────────────────────────────────────────────────
      case "setProjectMode": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const mode = body.mode === "group" ? "group" : "single";
        if (!id) return badRequest("missing_id");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          mode,
          updatedAt: nowIso,
          history: stamp(project, { action: "detail", detail: `เปลี่ยนเป็น${mode === "group" ? "งานกลุ่ม" : "งานเดี่ยว"}` })
        });
        return NextResponse.json({ ok: true });
      }

      case "deleteProject": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).delete();
        return NextResponse.json({ ok: true });
      }

      // ── คนทำเพิ่ม progress (กี่ครั้งก็ได้ เวลาไหนก็ได้) ────────────────────
      case "addProgress": {
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        // เฉพาะคนที่ถูกมอบหมาย (หรือแอดมิน) — เอาตัวตนจาก session ไม่เชื่อ body
        if (!isAdmin(user) && !project.assignees.includes(staffCode)) return forbidden();
        // งานเดี่ยวที่ส่งต่อมาแล้ว: คนที่ส่งงานได้คือ owner ปัจจุบันเท่านั้น — เจ้าของเดิมยังอยู่ใน
        // รายชื่อเพื่อดูประวัติ แต่ไม่ควรมาส่งงานทับคนที่ถืองานอยู่ (งานกลุ่มยังใครส่งก็ได้เหมือนเดิม)
        if (!isAdmin(user) && projectMode(project) === "single" && (project.handovers || []).length > 0 && currentOwnerOf(project) !== staffCode) {
          return badRequest("งานนี้ส่งต่อให้คนอื่นแล้ว — ผู้รับผิดชอบปัจจุบันเป็นคนส่งงาน");
        }
        const mode = trackModeOf(project);
        const amount = mode === "amount" ? Number(body.amount) : NaN;
        if (mode === "amount" && (!Number.isFinite(amount) || amount < 0)) return badRequest("ต้องใส่จำนวนที่ทำเพิ่มวันนี้เป็นตัวเลข");
        // งานแบบใหม่ไม่ให้น้องเดา % — amount คิด % จากเป้าให้ · workdays/done ไม่มี %
        const percent =
          mode === "percent"
            ? clampPercent(Number(body.percent))
            : mode === "amount" && project.targetAmount
              ? clampPercent(((amountDone(project) + amount) / project.targetAmount) * 100)
              : 0;
        const note = str(body.note).trim();
        const invalid = validateProgressInput({ percent, note });
        if (invalid) return badRequest(invalid);
        const date = isIsoDate(body.date) ? (body.date as string) : nowIso.slice(0, 10);
        const entry: ProjectProgress = {
          id: `pg__${nowIso}__${staffCode || user.actualEmail}`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
          date,
          at: nowIso,
          by: staffCode || user.actualEmail,
          percent,
          note,
          // รูป/ลิงก์ ถูกเรนเดอร์เป็น <a href> ให้คนอื่นกด — รับเฉพาะ https หรือ path ในเว็บนี้
          // (กัน javascript:/data: หลุดเข้าไปเป็นปุ่มให้คนกด) ใช้กติกาเดียวกับลิงก์ใน checklist
          ...(safeUrls(body.images).length ? { images: safeUrls(body.images) } : {}),
          ...(isValidLinkUrl(str(body.link).trim()) ? { link: str(body.link).trim() } : {}),
          ...(mode === "amount" ? { amount } : {})
        };
        const progress = [...(project.progress || []), entry].slice(-MAX_PROJECT_PROGRESS);
        // แบบเดิม (%): 100% = งานเสร็จ · แบบใหม่ต้องกด "ส่งงานสมบูรณ์" พร้อมหลักฐานเท่านั้น
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          progress,
          updatedAt: nowIso,
          ...(mode === "percent" && percent >= 100 && project.status === "active" ? { status: "done" as ProjectStatus } : {})
        });
        return NextResponse.json({ ok: true });
      }

      // ── ส่งงานสมบูรณ์ + หลักฐาน → หายจากหน้าแจ้งเตือน รอเจ้าของตรวจ ─────────────
      case "submitFinal": {
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        if (!isAdmin(user) && !project.assignees.includes(staffCode)) return forbidden();
        if (project.status === "cancelled") return badRequest("งานนี้ถูกยกเลิกแล้ว");
        const by = staffCode || user.actualEmail;
        const images = safeUrls(body.images);
        const note = str(body.note).trim();
        const invalid = validateSubmission({ note, images });
        if (invalid) return badRequest(invalid);
        // กดซ้ำ (เน็ตช้า กดสองที) ภายใน 1 นาที = ครั้งเดียว
        const last = (project.submissions || []).filter((entry) => entry.by === by).slice(-1)[0];
        if (last && Date.parse(nowIso) - Date.parse(last.at) < 60_000) return NextResponse.json({ ok: true, duplicate: true });
        const submission: TaskSubmission = {
          id: `sb__${nowIso}__${by}`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
          by,
          at: nowIso,
          date: isIsoDate(body.date) ? (body.date as string) : nowIso.slice(0, 10),
          note,
          images,
          ...(isValidLinkUrl(str(body.link).trim()) ? { link: str(body.link).trim() } : {})
        };
        const submissions = [...(project.submissions || []), submission].slice(-100);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          submissions,
          ...(everyoneDone({ ...project, submissions }) ? { status: "done" as ProjectStatus } : {}),
          updatedAt: nowIso,
          history: stamp(project, { action: "status", detail: `ส่งงานสมบูรณ์ โดย ${by}` })
        });
        return NextResponse.json({ ok: true });
      }

      // ── แอดมินปรับ % ของงานโดยตรง (เพิ่ม/ลด) โดยไม่ต้องเขียนโน้ตเหมือนคนทำ ───
      // ใช้ตอนเจ้าของอยากแก้แถบ % ที่คนทำลงมาผิด หรืออยากปรับให้ตรงหน้างานจริง
      case "setPercent": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        const percent = clampPercent(Number(body.percent));
        if (!Number.isFinite(percent)) return badRequest("bad_percent");
        const date = isIsoDate(body.date) ? (body.date as string) : nowIso.slice(0, 10);
        const entry: ProjectProgress = {
          id: `pg__${nowIso}__admin`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
          date,
          at: nowIso,
          by: user.actualEmail,
          percent,
          // โน้ตอัตโนมัติให้เห็นชัดว่าแถบ % นี้เจ้าของเป็นคนปรับเอง ไม่ใช่คนทำลง
          note: `ปรับ % โดยแอดมิน (${user.actualName || user.actualEmail}) → ${percent}%`
        };
        const progress = [...(project.progress || []), entry].slice(-MAX_PROJECT_PROGRESS);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          progress,
          updatedAt: nowIso,
          // ปรับถึง 100% = ปิดงาน · ปรับลงต่ำกว่า 100 ในงานที่ปิดไปแล้ว = เปิดใหม่
          ...(percent >= 100 && project.status === "active" ? { status: "done" as ProjectStatus } : {}),
          ...(percent < 100 && project.status === "done" ? { status: "active" as ProjectStatus } : {})
        });
        return NextResponse.json({ ok: true });
      }

      // ── ลบ progress ที่ลงผิด (คนลงเอง หรือแอดมิน) ──────────────────────────
      case "deleteProgress": {
        const id = docId(body.id);
        const progressId = str(body.progressId).trim();
        if (!id || !progressId) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        const target = (project.progress || []).find((entry) => entry.id === progressId);
        if (!target) return badRequest("not_found");
        if (!isAdmin(user) && target.by !== staffCode) return forbidden();
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          progress: (project.progress || []).filter((entry) => entry.id !== progressId),
          updatedAt: nowIso
        });
        return NextResponse.json({ ok: true });
      }

      // ── ส่งต่องานให้คนถัดไป (owner ปัจจุบัน หรือแอดมิน) ─────────────────────
      // ผู้รับ "รับงานอัตโนมัติ" ตามใบงาน — งานเปลี่ยนมือทันทีโดยไม่ต้องรอกดตอบรับ ส่วนประวัติ
      // ผู้รับผิดชอบเดิม + progress + หลักฐานทั้งหมดยังอยู่ครบในเอกสารเดิม.
      case "handoverProject":
      case "forceProjectOwner": {
        const forced = body.action === "forceProjectOwner";
        if (forced && !isAdmin(user)) return forbidden();
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        const input = {
          to: str(body.to).trim(),
          date: isIsoDate(body.date) ? (body.date as string) : nowIso.slice(0, 10),
          note: str(body.note).trim(),
          attachments: safeUrls(body.attachments),
          forced
        };
        const invalid = validateHandover(project, input, { staffCode, isAdmin: isAdmin(user) });
        if (invalid) return badRequest(invalid);
        const patch = applyHandover(project, input, { at: nowIso, by: user.actualEmail, ...(user.actualName ? { byName: user.actualName } : {}) });
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          currentOwner: patch.currentOwner,
          originalOwner: patch.originalOwner,
          assignees: patch.assignees,
          handovers: patch.handovers,
          updatedAt: nowIso,
          history: stamp(project, { action: "handover", detail: handoverSummary(patch.entry) })
        });
        return NextResponse.json({ ok: true, currentOwner: patch.currentOwner });
      }

      // ── แอดมิน "ยืนยันผ่าน" งานของคนคนหนึ่ง → คิดคะแนน KPI ให้อัตโนมัติ ──────
      // เร็ว/ตรงเวลา/แก้ทัน/ช้า คิดจากวันส่งจริงเทียบกำหนดที่มีผล (เดิม หรือกำหนดแก้ไข).
      case "reviewApprove": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const assignee = str(body.assignee).trim();
        if (!id || !assignee) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        if (!project.assignees.includes(assignee)) return badRequest("ไม่พบชื่อคนนี้ในงาน");
        const submittedDate = isIsoDate(body.submittedDate)
          ? (body.submittedDate as string)
          : lastSubmissionFor(project, assignee)?.date || nowIso.slice(0, 10);
        const dueDate = effectiveDue(project, assignee);
        const hadRevision = hasOpenRevision(reviewEntriesFor(project, assignee));
        // งานที่เคยส่งต่อและส่งช้า → หักคนละส่วนตามวันที่แต่ละคนถือครองงานจริง
        // งานที่ไม่เคยส่งต่อ → ได้รายการเดียวเหมือนเดิม
        // เจ้าของปรับคะแนนเอง (points) → รายการเดียวของคนที่ตรวจ ตามเลขที่เจ้าของใส่
        const override = reviewPointsOverride(body.points);
        const auto = splitReviewByOwner(project, { assignee, dueDate, submittedDate, hadRevision });
        const splits = override === null ? auto : [{ ...auto[0], assignee, points: override }];
        const note = str(body.note).trim();
        const reviewImages = safeUrls(body.images);
        const entries: ProjectReviewEntry[] = splits.map((split, index) => ({
          id: `rv__${nowIso}__${split.assignee}__${index}`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
          assignee: split.assignee,
          outcome: split.outcome,
          dueDate,
          submittedDate,
          daysLate: split.daysLate,
          points: split.points,
          ...(note ? { note } : {}),
          ...(reviewImages.length ? { images: reviewImages } : {}),
          ...(override !== null ? { manual: true } : {}),
          confirmedBy: user.actualEmail,
          ...(user.actualName ? { confirmedByName: user.actualName } : {}),
          confirmedAt: nowIso
        }));
        const totalPoints = entries.reduce((sum, entry) => sum + entry.points, 0);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          reviews: [...(project.reviews || []), ...entries],
          updatedAt: nowIso,
          // ทุกคนผ่าน/ส่งแล้ว = ปิดงาน · ยังมีคนค้าง = งานยังเปิดให้คนนั้นได้รับการเตือนต่อ
          ...(everyoneDone({ ...project, reviews: [...(project.reviews || []), ...entries] }) ? { status: "done" as ProjectStatus } : {}),
          history: stamp(project, {
            action: "review",
            detail: `ยืนยันผ่าน ${entries.map((entry) => `${entry.assignee}: ${entry.outcome} (${entry.points >= 0 ? "+" : ""}${entry.points})`).join(" · ")}`
          })
        });
        return NextResponse.json({ ok: true, points: totalPoints, outcome: entries[0]?.outcome, entries: entries.length });
      }

      // ── แอดมิน "ให้แก้ไข" งานของคนคนหนึ่ง → หัก −1 ทันที + ตั้งกำหนดส่งใหม่ ────
      case "reviewRequestFix": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const assignee = str(body.assignee).trim();
        const revisedDue = str(body.revisedDue);
        if (!id || !assignee) return badRequest("missing_params");
        if (!isIsoDate(revisedDue)) return badRequest("ต้องระบุกำหนดส่งแก้ไขใหม่");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        if (!project.assignees.includes(assignee)) return badRequest("ไม่พบชื่อคนนี้ในงาน");
        const dueDate = effectiveDue(project, assignee);
        const comp = computeReviewPoints({ verdict: "request_fix", dueDate, hadRevision: false });
        const fixOverride = reviewPointsOverride(body.points);
        if (fixOverride !== null) comp.points = fixOverride;
        const fixImages = safeUrls(body.images);
        const entry: ProjectReviewEntry = {
          id: `rv__${nowIso}__${assignee}`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
          assignee,
          outcome: comp.outcome,
          dueDate,
          revisedDue,
          daysLate: 0,
          points: comp.points,
          ...(str(body.note).trim() ? { note: str(body.note).trim() } : {}),
          ...(fixImages.length ? { images: fixImages } : {}),
          ...(fixOverride !== null ? { manual: true } : {}),
          confirmedBy: user.actualEmail,
          ...(user.actualName ? { confirmedByName: user.actualName } : {}),
          confirmedAt: nowIso
        };
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          reviews: [...(project.reviews || []), entry],
          // สั่งแก้ = งานกลับมาเปิด → ขึ้นในหน้าแจ้งเตือนงานของน้องอีกครั้ง
          status: "active" as ProjectStatus,
          updatedAt: nowIso,
          history: stamp(project, { action: "review", detail: `ให้แก้ไข ${assignee}: ${comp.points} · กำหนดใหม่ ${revisedDue}` })
        });
        return NextResponse.json({ ok: true, points: comp.points });
      }

      // ── แอดมินลบผลตรวจที่กดผิด (แก้ประวัติคะแนน) ────────────────────────────
      case "deleteReview": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        const reviewId = str(body.reviewId).trim();
        if (!id || !reviewId) return badRequest("missing_params");
        const project = await load(id);
        if (project instanceof NextResponse) return project;
        const target = (project.reviews || []).find((entry) => entry.id === reviewId);
        if (!target) return badRequest("not_found");
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          reviews: (project.reviews || []).filter((entry) => entry.id !== reviewId),
          updatedAt: nowIso,
          history: stamp(project, { action: "review", detail: `ลบผลตรวจ ${target.assignee}: ${target.outcome} (${target.points >= 0 ? "+" : ""}${target.points})` })
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
