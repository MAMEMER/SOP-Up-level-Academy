import { NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { requireUser } from "../../../../lib/auth.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { WORK_RECORDS_COLLECTION, workRecordDocId, type WorkRecordDoc } from "../../../../lib/work-records.ts";

// Moves checklist history from one employeeKey to another after a staff code is renamed.
//
//   GET  /api/admin/migrate-work-records?from=ICE&to=UP-004   → preview, never writes
//   POST /api/admin/migrate-work-records?from=ICE&to=UP-004   → performs the move
//
// The key is the staff code and it prefixes the document id, so a rename leaves the old
// days stranded: the person stops seeing their own history, and the next tick opens a
// SECOND document for the same day, double-counting that day on the owner dashboard.
//
// This collection is written with the service account (the shared firestore.rules do not
// open it), so the migration has to run here rather than from a local script.
export const dynamic = "force-dynamic";

async function migrate(request: Request, apply: boolean) {
  const user = await requireUser();
  if (user.role !== "admin" || user.isImpersonating) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!hasAdminCredentials()) {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const from = (params.get("from") || "").trim();
  const to = (params.get("to") || "").trim();
  if (!from || !to || from === to) {
    return NextResponse.json({ error: "from_and_to_required" }, { status: 400 });
  }

  const db = adminDb();
  // ids are `${employeeKey}__${scopeKey}`, so the whole person is one id range
  const snapshot = await db
    .collection(WORK_RECORDS_COLLECTION)
    .orderBy(FieldPath.documentId())
    .startAt(`${from}__`)
    .endAt(`${from}__`)
    .get();

  const moves = snapshot.docs.map((doc) => {
    const data = doc.data() as WorkRecordDoc;
    return { from: doc.id, to: workRecordDocId(to, data.scopeKey), scopeKey: data.scopeKey };
  });

  if (apply) {
    for (const doc of snapshot.docs) {
      const data = doc.data() as WorkRecordDoc;
      await db
        .collection(WORK_RECORDS_COLLECTION)
        .doc(workRecordDocId(to, data.scopeKey))
        .set({ ...data, employeeKey: to });
      await doc.ref.delete();
    }
  }

  return NextResponse.json({ ok: true, from, to, applied: apply, count: moves.length, moves });
}

/** Preview only — a GET must never move data, so nothing here can fire from a prefetch. */
export async function GET(request: Request) {
  return migrate(request, false);
}

export async function POST(request: Request) {
  return migrate(request, true);
}
