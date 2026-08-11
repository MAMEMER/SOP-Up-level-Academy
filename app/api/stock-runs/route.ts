import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { weeklyStockSleevePhase } from "../../../lib/weekly-stock-workflow.ts";
import { monthlyStockSinglePhase } from "../../../lib/monthly-stock-single-workflow.ts";
import {
  appendApproval,
  buildStockRun,
  canSubmitStockRun,
  isStockRunActionable,
  isStockRunReviewable,
  type StockApprovalEntry,
  type StockCountLine,
  type StockRun,
  type StockRunKind
} from "../../../lib/stock-runs.ts";

// Server route for Weekly / Monthly Stock Runs — the "ตรวจนับ Stock รายครั้ง" flow that
// replaces the ad-hoc checklist window (which never persisted per run and had no review).
// Same shape as /api/work-tasks: session-verified, never writes while impersonating, and the
// Admin SDK (service account) does the actual read/write so the shared guild firestore.rules
// need no `allow write` for this collection. Identity (assignedBy / approver) always comes
// from the session, never the request body.

export const dynamic = "force-dynamic";
const RUNS = "stock_runs";

function snapshotFor(kind: StockRunKind) {
  const phase = kind === "weekly" ? weeklyStockSleevePhase : monthlyStockSinglePhase;
  return { title: phase.title, items: [...phase.checklist] };
}

function newId(kind: string, staff: string, iso: string): string {
  return `sr__${kind}__${staff}__${iso}`.replace(/[^a-zA-Z0-9_:\-.]/g, "-").slice(0, 140);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function parseCounts(value: unknown): StockCountLine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      name: typeof row.name === "string" ? row.name.slice(0, 200) : "",
      system: num(row.system),
      counted: num(row.counted)
    };
  });
}

function parseChecklistDone(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === true) out[String(key)] = true;
  }
  return out;
}

function parseEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 30);
}

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const action = p.get("action");
  const branch = p.get("branch") || "";
  const kind = (p.get("kind") || "") as StockRunKind | "";

  // Dev preview (no service account) has no Firestore — return empty instead of 500 so the
  // page renders "ยังไม่มีงาน" rather than crashing. Production always has credentials.
  if (!hasAdminCredentials()) {
    if (action === "runById") return NextResponse.json({ run: null });
    return NextResponse.json({ runs: [] });
  }

  try {
    switch (action) {
      case "runsForStaff": {
        const staffCode = p.get("staffCode") || "";
        if (!branch || !staffCode) return badRequest("missing_params");
        let query = db().collection(RUNS).where("branch", "==", branch).where("staffCode", "==", staffCode);
        if (kind) query = query.where("kind", "==", kind);
        const snap = await query.get();
        return NextResponse.json({ runs: snap.docs.map((d) => d.data() as StockRun) });
      }
      case "runsForBranch": {
        if (!branch) return badRequest("missing_branch");
        let query = db().collection(RUNS).where("branch", "==", branch);
        if (kind) query = query.where("kind", "==", kind);
        const snap = await query.get();
        return NextResponse.json({ runs: snap.docs.map((d) => d.data() as StockRun) });
      }
      case "runById": {
        const id = p.get("id") || "";
        if (!id) return badRequest("missing_id");
        const snap = await db().collection(RUNS).doc(id).get();
        return NextResponse.json({ run: snap.exists ? (snap.data() as StockRun) : null });
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
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const nowIso = new Date().toISOString();

  async function loadOwned(id: string): Promise<StockRun | NextResponse> {
    const snap = await db().collection(RUNS).doc(id).get();
    if (!snap.exists) return badRequest("not_found");
    const run = snap.data() as StockRun;
    // staff may only touch their own run; an admin may act on any.
    if (!isAdmin(user) && run.staffCode !== staffCode) return forbidden();
    return run;
  }

  try {
    switch (body.action) {
      // ── แอดมินมอบหมายงานตรวจนับ (สร้าง Run ใหม่ 1 รายการต่อการทำงาน 1 ครั้ง) ──────
      case "assignRun": {
        if (!isAdmin(user)) return forbidden();
        const kind = str(body.kind) === "monthly" ? "monthly" : str(body.kind) === "weekly" ? "weekly" : "";
        const branch = str(body.branch);
        const staff = str(body.staffCode);
        const periodLabel = str(body.periodLabel);
        if (!kind || !branch || !staff || !periodLabel) return badRequest("missing_params");
        const id = newId(kind, staff, nowIso);
        const run = buildStockRun({
          id,
          kind,
          branch,
          staffCode: staff,
          assignedBy: user.actualEmail,
          periodLabel,
          dueDate: str(body.dueDate),
          checklist: snapshotFor(kind),
          createdAt: nowIso
        });
        await db().collection(RUNS).doc(id).set(run);
        return NextResponse.json({ ok: true, id });
      }

      // ── พนักงานเริ่มตรวจนับเอง (สร้าง Run ใหม่ทันที) ────────────────────────────
      case "startNewRun": {
        const kind = str(body.kind) === "monthly" ? "monthly" : str(body.kind) === "weekly" ? "weekly" : "";
        const branch = str(body.branch);
        const periodLabel = str(body.periodLabel);
        // แอดมินระบุ staff ได้ พนักงานสร้างให้ตัวเองเท่านั้น
        const staff = isAdmin(user) && str(body.staffCode) ? str(body.staffCode) : staffCode;
        if (!kind || !branch || !periodLabel) return badRequest("missing_params");
        if (!staff) return badRequest("no_staff_identity");
        const id = newId(kind, staff, nowIso);
        const run: StockRun = {
          ...buildStockRun({
            id,
            kind,
            branch,
            staffCode: staff,
            assignedBy: user.actualEmail,
            periodLabel,
            dueDate: str(body.dueDate),
            checklist: snapshotFor(kind),
            createdAt: nowIso
          }),
          status: "in_progress",
          startedAt: nowIso
        };
        await db().collection(RUNS).doc(id).set(run);
        return NextResponse.json({ ok: true, id });
      }

      // ── พนักงานกด "เริ่มตรวจนับ" (จากงานที่แอดมินมอบหมายไว้) ──────────────────
      case "startRun": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const run = await loadOwned(id);
        if (run instanceof NextResponse) return run;
        if (run.status !== "assigned") return badRequest("already_started");
        await db().collection(RUNS).doc(id).update({ status: "in_progress", startedAt: nowIso });
        return NextResponse.json({ ok: true });
      }

      // ── พนักงานบันทึกความคืบหน้า (draft) ──────────────────────────────────────
      case "saveRun": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const run = await loadOwned(id);
        if (run instanceof NextResponse) return run;
        if (!isStockRunActionable(run.status)) return badRequest("not_editable");
        const patch: Partial<StockRun> = {
          counts: parseCounts(body.counts),
          checklistDone: parseChecklistDone(body.checklistDone),
          lowStock: str(body.lowStock),
          refill: str(body.refill),
          reorder: str(body.reorder),
          note: str(body.note),
          evidence: parseEvidence(body.evidence)
        };
        // เริ่มนับอัตโนมัติเมื่อเริ่มกรอกจากสถานะ assigned (กันเคสกรอกก่อนกดปุ่มเริ่ม)
        if (run.status === "assigned") {
          patch.status = "in_progress";
          patch.startedAt = nowIso;
        }
        await db().collection(RUNS).doc(id).update(patch as Record<string, unknown>);
        return NextResponse.json({ ok: true });
      }

      // ── พนักงานกด "ส่งงานตรวจนับ" ─────────────────────────────────────────────
      case "submitRun": {
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const run = await loadOwned(id);
        if (run instanceof NextResponse) return run;
        if (!isStockRunActionable(run.status)) return badRequest("not_submittable");
        const counts = parseCounts(body.counts);
        const evidence = parseEvidence(body.evidence);
        if (!canSubmitStockRun({ counts, evidence })) {
          return badRequest("ต้องกรอกรายการนับอย่างน้อย 1 รายการและแนบรูปหลักฐานก่อนส่งงาน");
        }
        await db()
          .collection(RUNS)
          .doc(id)
          .update({
            counts,
            evidence,
            checklistDone: parseChecklistDone(body.checklistDone),
            lowStock: str(body.lowStock),
            refill: str(body.refill),
            reorder: str(body.reorder),
            note: str(body.note),
            status: "submitted",
            submittedAt: nowIso,
            ...(run.startedAt ? {} : { startedAt: nowIso })
          });
        return NextResponse.json({ ok: true });
      }

      // ── แอดมินอนุมัติ ─────────────────────────────────────────────────────────
      case "approveRun": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        const run = await loadOwned(id);
        if (run instanceof NextResponse) return run;
        if (!isStockRunReviewable(run.status)) return badRequest("not_reviewable");
        const entry: StockApprovalEntry = { by: user.actualEmail, status: "approved", note: str(body.note), at: nowIso };
        await db()
          .collection(RUNS)
          .doc(id)
          .update({ status: "approved", reviewedAt: nowIso, approvals: appendApproval(run.approvals || [], entry) });
        return NextResponse.json({ ok: true });
      }

      // ── แอดมินให้แก้ไข (พร้อมหมายเหตุ) ────────────────────────────────────────
      case "requestRevision": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        const note = str(body.note).trim();
        if (!id) return badRequest("missing_id");
        if (!note) return badRequest("ใส่หมายเหตุว่าต้องแก้อะไร");
        const run = await loadOwned(id);
        if (run instanceof NextResponse) return run;
        if (!isStockRunReviewable(run.status)) return badRequest("not_reviewable");
        const entry: StockApprovalEntry = { by: user.actualEmail, status: "needs_revision", note, at: nowIso };
        await db()
          .collection(RUNS)
          .doc(id)
          .update({ status: "needs_revision", reviewedAt: nowIso, approvals: appendApproval(run.approvals || [], entry) });
        return NextResponse.json({ ok: true });
      }

      case "deleteRun": {
        if (!isAdmin(user)) return forbidden();
        const id = str(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(RUNS).doc(id).delete();
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
