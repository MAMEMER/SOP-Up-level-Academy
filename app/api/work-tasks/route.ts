import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";

// Server route for owner→staff assignments and staff↔staff handoffs (fix 1). Replaces the
// client store (lib/work-assignments-store.ts). These feed the KPI "งานที่มอบหมาย" engine,
// so writes are session-verified and never happen while impersonating. Ownership:
//  - assign / review (revision, accept, delete): admin only.
//  - submit / mark-done: the assignment's own staffer, or an admin.
//  - handoffs (create / claim / complete): any signed-in staffer.

export const dynamic = "force-dynamic";
const ASSIGNMENTS = "work_assignments";
const HANDOFFS = "work_handoffs";
// เท่ากับ MAX_ASSIGNMENT_PROGRESS ใน lib/work-assignments-store.ts — ไฟล์นั้นเป็น "use client"
// จึง import ข้ามมาที่ route ฝั่ง server ไม่ได้ (ดูหมายเหตุใน lib/work-assignments-server.ts)
const MAX_ASSIGNMENT_PROGRESS = 50;

function newId(prefix: string, ...parts: string[]): string {
  return `${prefix}__${parts.join("__").replace(/\s+/g, "-").slice(0, 120)}`;
}

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const action = p.get("action");
  const branch = p.get("branch") || "";
  try {
    switch (action) {
      case "myAssignments": {
        const workDate = p.get("workDate") || "";
        const staffCode = p.get("staffCode") || "";
        if (!branch || !workDate || !staffCode) return badRequest("missing_params");
        const snap = await db()
          .collection(ASSIGNMENTS)
          .where("branch", "==", branch)
          .where("workDate", "==", workDate)
          .where("staffCode", "==", staffCode)
          .get();
        return NextResponse.json({ assignments: snap.docs.map((d) => d.data()) });
      }
      case "assignmentsForDate": {
        const workDate = p.get("workDate") || "";
        if (!branch || !workDate) return badRequest("missing_params");
        const snap = await db().collection(ASSIGNMENTS).where("branch", "==", branch).where("workDate", "==", workDate).get();
        return NextResponse.json({ assignments: snap.docs.map((d) => d.data()) });
      }
      case "assignmentsForStaff": {
        const staffCode = p.get("staffCode") || "";
        if (!branch || !staffCode) return badRequest("missing_params");
        const snap = await db().collection(ASSIGNMENTS).where("branch", "==", branch).where("staffCode", "==", staffCode).get();
        return NextResponse.json({ assignments: snap.docs.map((d) => d.data()) });
      }
      case "assignmentById": {
        const id = p.get("id") || "";
        if (!id) return badRequest("missing_id");
        const snap = await db().collection(ASSIGNMENTS).doc(id).get();
        return NextResponse.json({ assignment: snap.exists ? snap.data() : null });
      }
      case "openHandoffs": {
        if (!branch) return badRequest("missing_branch");
        const snap = await db().collection(HANDOFFS).where("branch", "==", branch).where("status", "in", ["open", "claimed"]).get();
        return NextResponse.json({ handoffs: snap.docs.map((d) => d.data()) });
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

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const nowIso = new Date().toISOString();

  try {
    switch (body.action) {
      // ── owner assigns work (admin only) ─────────────────────────────────────
      case "assignWork": {
        if (!isAdmin(user)) return forbidden();
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const staff = str(body.staffCode);
        const title = str(body.title);
        if (!branch || !workDate || !staff || !title) return badRequest("missing_params");
        const id = newId("wa", workDate, staff, nowIso);
        const attachments = strArr(body.attachments);
        const record: Record<string, unknown> = {
          id,
          branch,
          workDate,
          staffCode: staff,
          title,
          ...(str(body.detail) ? { detail: str(body.detail) } : {}),
          ...(str(body.location) ? { location: str(body.location) } : {}),
          ...(str(body.expectedResult) ? { expectedResult: str(body.expectedResult) } : {}),
          ...(str(body.dueTime) ? { dueTime: str(body.dueTime) } : {}),
          ...(attachments.length ? { attachments } : {}),
          ...(str(body.trackingNumber) ? { trackingNumber: str(body.trackingNumber) } : {}),
          status: "open",
          assignedBy: user.actualEmail,
          createdAt: nowIso
        };
        await db().collection(ASSIGNMENTS).doc(id).set(record);
        return NextResponse.json({ ok: true, id });
      }

      // ── staff submits their own work (own assignment or admin) ───────────────
      case "submitAssignment": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const ref = db().collection(ASSIGNMENTS).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const owner = str((snap.data() as { staffCode?: string }).staffCode);
        if (!isAdmin(user) && owner !== staffCode) return forbidden();
        const note = str(body.note).trim();
        const imageEvidence = strArr(body.imageEvidence);
        const evidence = str(body.evidence);
        const hasEvidence = imageEvidence.some((u) => u.trim().length > 0) || Boolean(evidence.trim());
        if (!note) return badRequest("ต้องกรอกรายละเอียดสิ่งที่ทำก่อนส่งงาน");
        if (!hasEvidence) return badRequest("ต้องแนบหลักฐานอย่างน้อย 1 อย่างก่อนส่งงาน");
        await ref.update({
          status: "submitted",
          note,
          evidence,
          imageEvidence,
          submittedAt: nowIso,
          revisionNote: ""
        });
        return NextResponse.json({ ok: true });
      }

      // ── staff reports progress without closing the job (own assignment or admin) ──
      // งานที่ยังทำไม่เสร็จก็รายงานได้ — ไม่แตะ status เพราะยังไม่ใช่การส่งงาน
      case "addAssignmentProgress": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const ref = db().collection(ASSIGNMENTS).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const current = snap.data() as { staffCode?: string; status?: string; progress?: unknown };
        if (!isAdmin(user) && str(current.staffCode) !== staffCode) return forbidden();
        if (current.status === "done") return badRequest("งานนี้ปิดแล้ว อัปเดตเพิ่มไม่ได้");
        const note = str(body.note).trim();
        if (!note) return badRequest("เขียนสั้นๆ ว่าตอนนี้ทำถึงไหนแล้ว");
        const images = strArr(body.images).filter((url) => url.trim().length > 0);
        const existing = Array.isArray(current.progress) ? (current.progress as Record<string, unknown>[]) : [];
        const entry = {
          id: newId("ap", id, nowIso),
          at: nowIso,
          by: staffCode || user.actualEmail,
          note,
          ...(images.length ? { images } : {})
        };
        await ref.update({
          progress: [...existing, entry].slice(-MAX_ASSIGNMENT_PROGRESS),
          lastProgressAt: nowIso
        });
        return NextResponse.json({ ok: true });
      }

      case "deleteAssignmentProgress": {
        const id = str(body.id);
        const progressId = str(body.progressId);
        if (!id || !progressId) return badRequest("missing_params");
        const ref = db().collection(ASSIGNMENTS).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const current = snap.data() as { staffCode?: string; progress?: unknown };
        if (!isAdmin(user) && str(current.staffCode) !== staffCode) return forbidden();
        const existing = Array.isArray(current.progress) ? (current.progress as { id?: string }[]) : [];
        await ref.update({ progress: existing.filter((entry) => entry?.id !== progressId) });
        return NextResponse.json({ ok: true });
      }

      case "markAssignmentDone": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const ref = db().collection(ASSIGNMENTS).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const owner = str((snap.data() as { staffCode?: string }).staffCode);
        if (!isAdmin(user) && owner !== staffCode) return forbidden();
        await ref.update({ status: "done", doneAt: nowIso });
        return NextResponse.json({ ok: true });
      }

      // ── owner review (admin only) ────────────────────────────────────────────
      case "requestAssignmentRevision": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(ASSIGNMENTS).doc(id).update({
          status: "needs_revision",
          revisionNote: str(body.note),
          reviewedAt: nowIso
        });
        return NextResponse.json({ ok: true });
      }
      case "acceptAssignment": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(ASSIGNMENTS).doc(id).update({ status: "done", doneAt: nowIso, reviewedAt: nowIso });
        return NextResponse.json({ ok: true });
      }
      case "deleteAssignment": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(ASSIGNMENTS).doc(id).delete();
        return NextResponse.json({ ok: true });
      }

      // ── handoffs (any signed-in staffer) ─────────────────────────────────────
      case "createHandoff": {
        const branch = str(body.branch);
        const workDate = str(body.workDate);
        const title = str(body.title);
        const fromStaff = staffCode || str(body.fromStaff);
        const toStaff = str(body.toStaff) || "any";
        if (!branch || !workDate || !title || !fromStaff) return badRequest("missing_params");
        const id = newId("ho", workDate, fromStaff, nowIso);
        const record: Record<string, unknown> = {
          id,
          branch,
          workDate,
          title,
          ...(str(body.detail) ? { detail: str(body.detail) } : {}),
          fromStaff,
          toStaff,
          status: "open",
          createdAt: nowIso
        };
        await db().collection(HANDOFFS).doc(id).set(record);
        return NextResponse.json({ ok: true, id });
      }
      case "claimHandoff": {
        const id = str(body.id);
        const claimer = staffCode || str(body.staffCode);
        if (!id || !claimer) return badRequest("missing_params");
        await db().collection(HANDOFFS).doc(id).update({ status: "claimed", claimedBy: claimer, claimedAt: nowIso });
        return NextResponse.json({ ok: true });
      }
      case "completeHandoff": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(HANDOFFS).doc(id).update({ status: "done", doneAt: nowIso });
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
