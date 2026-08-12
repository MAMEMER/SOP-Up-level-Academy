import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  REVIEW_VERDICTS_COLLECTION,
  isReviewScope,
  isReviewStatus,
  reviewGroupKey,
  reviewVerdictId,
  type ReviewVerdict
} from "../../../lib/review-verdicts.ts";

// Admin-only review verdicts for submitted checklists (daily / weekly / monthly / assigned).
// Same session-verified, service-account pattern as /api/stock-runs: the reviewer identity
// is taken from the SOP session, never the request body, and impersonated sessions can read
// but never write. See lib/review-verdicts.ts for the model.

export const dynamic = "force-dynamic";

/**
 * GET /api/review-verdicts?scope=daily&scopeKey=d-2026-08-12
 *   → admin only: every verdict recorded for that submission window.
 */
export async function GET(request: Request) {
  const { user } = await actor();
  if (!isAdmin(user)) return forbidden();
  if (!hasAdminCredentials()) return NextResponse.json({ verdicts: [], storageReady: false });

  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  const scopeKey = params.get("scopeKey");
  if (!isReviewScope(scope) || !scopeKey) return badRequest("bad_scope");

  try {
    const snap = await db()
      .collection(REVIEW_VERDICTS_COLLECTION)
      .where("groupKey", "==", reviewGroupKey(scope, scopeKey))
      .get();
    const verdicts = snap.docs.map((doc) => doc.data() as ReviewVerdict);
    return NextResponse.json({ verdicts, storageReady: true });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/review-verdicts
 *   body: { scope, scopeKey, employeeKey, employeeName, unitId, unitLabel, status, note }
 *   → admin records/updates the verdict for one submitted unit of work.
 */
export async function POST(request: Request) {
  const { user } = await actor();
  if (!isAdmin(user)) return forbidden();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("bad_json");

  const scope = body.scope;
  const scopeKey = typeof body.scopeKey === "string" ? body.scopeKey : "";
  const employeeKey = typeof body.employeeKey === "string" ? body.employeeKey : "";
  const unitId = typeof body.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : "all";
  const status = body.status;
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : "";

  if (!isReviewScope(scope) || !scopeKey || !employeeKey) return badRequest("missing_fields");
  if (!isReviewStatus(status)) return badRequest("bad_status");
  // Asking for a fix without saying what to fix is a dead-end for the staffer.
  if (status === "needs_fix" && !note.trim()) return badRequest("note_required");

  const verdict: ReviewVerdict = {
    key: reviewVerdictId(scope, scopeKey, employeeKey, unitId),
    groupKey: reviewGroupKey(scope, scopeKey),
    scope,
    scopeKey,
    employeeKey,
    employeeName: typeof body.employeeName === "string" ? body.employeeName.slice(0, 200) : employeeKey,
    unitId,
    unitLabel: typeof body.unitLabel === "string" ? body.unitLabel.slice(0, 200) : "",
    status,
    note,
    reviewedBy: user.actualEmail,
    reviewedByName: user.actualName,
    reviewedAt: new Date().toISOString()
  };

  try {
    await db().collection(REVIEW_VERDICTS_COLLECTION).doc(verdict.key).set(verdict);
    return NextResponse.json({ ok: true, verdict });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
