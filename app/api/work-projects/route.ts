import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  MAX_PROJECT_PROGRESS,
  WORK_PROJECTS_COLLECTION,
  clampPercent,
  isIsoDate,
  validateProgressInput,
  validateProjectDraft,
  type ProjectHistoryEntry,
  type ProjectProgress,
  type ProjectStatus,
  type WorkProject
} from "../../../lib/work-projects.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";

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
const strArr = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))) : []);
const safeUrls = (v: unknown) => strArr(v).filter((url) => isValidLinkUrl(url));

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
        return NextResponse.json({ projects: snap.docs.map((d) => d.data() as WorkProject) });
      }
      case "projectsForStaff": {
        const staffCode = p.get("staffCode") || "";
        if (!branch || !staffCode) return badRequest("missing_params");
        const snap = await db()
          .collection(WORK_PROJECTS_COLLECTION)
          .where("branch", "==", branch)
          .where("assignees", "array-contains", staffCode)
          .get();
        return NextResponse.json({ projects: snap.docs.map((d) => d.data() as WorkProject) });
      }
      case "projectById": {
        const id = (p.get("id") || "").trim();
        if (!id || id.includes("/")) return badRequest("missing_id");
        const snap = await db().collection(WORK_PROJECTS_COLLECTION).doc(id).get();
        return NextResponse.json({ project: snap.exists ? (snap.data() as WorkProject) : null });
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
        const id = newId(nowIso, draft.title);
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
        const invalid = validateProjectDraft({ ...project, startDate, endDate });
        if (invalid) return badRequest(invalid);
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          startDate,
          endDate,
          updatedAt: nowIso,
          history: stamp(project, {
            action: "dates",
            detail: `${project.startDate} → ${project.endDate} เป็น ${startDate} → ${endDate}`
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
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          assignees,
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
        const percent = clampPercent(Number(body.percent));
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
          ...(isValidLinkUrl(str(body.link).trim()) ? { link: str(body.link).trim() } : {})
        };
        const progress = [...(project.progress || []), entry].slice(-MAX_PROJECT_PROGRESS);
        // 100% ที่คนทำรายงาน = งานเสร็จ แต่ยังให้เจ้าของเปลี่ยนสถานะเองได้ทีหลัง
        await db().collection(WORK_PROJECTS_COLLECTION).doc(id).update({
          progress,
          updatedAt: nowIso,
          ...(percent >= 100 && project.status === "active" ? { status: "done" as ProjectStatus } : {})
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

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
