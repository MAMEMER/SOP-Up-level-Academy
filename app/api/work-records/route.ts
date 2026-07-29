import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail, employeeDirectory } from "../../../lib/employee-directory.ts";
import { listRecordsForScopeKey, listRecordsInRange, storageMode, upsertRecord } from "../../../lib/work-records-store.ts";
import {
  MAX_WORK_RECORD_BYTES,
  employeeKeyFromEmail,
  isValidScope,
  teamKeyForBranch,
  type WorkRecordDoc
} from "../../../lib/work-records.ts";

export const dynamic = "force-dynamic";

function branchForEmail(email: string) {
  const code = employeeCodeForEmail(email);
  return employeeDirectory.find((entry) => entry.code === code)?.branch || "bangkae";
}

function keyForEmail(email: string) {
  return employeeKeyFromEmail(email, employeeCodeForEmail(email));
}

/** "team" records are shared per branch; anything else is the person's own record. */
function ownerKeyFor(email: string, owner: string | null) {
  return owner === "team" ? teamKeyForBranch(branchForEmail(email)) : keyForEmail(email);
}

/**
 * GET /api/work-records?scope=daily&from=d-2026-07-01&to=d-2026-07-31
 *   → the current (or impersonated) user's documents in that range.
 * GET /api/work-records?scope=daily&scopeKey=d-2026-07-29&everyone=1
 *   → admin only: every employee's document for that exact window.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  if (storageMode() === "unavailable") {
    return NextResponse.json({ records: [], storageReady: false });
  }

  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  if (!isValidScope(scope)) return NextResponse.json({ error: "bad_scope" }, { status: 400 });

  try {
    if (params.get("everyone") === "1") {
      // Impersonation resolves to the employee's role, so an impersonated view must not
      // keep the admin-wide read.
      if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const scopeKey = params.get("scopeKey");
      if (!scopeKey) return NextResponse.json({ error: "missing_scope_key" }, { status: 400 });
      return NextResponse.json({ records: await listRecordsForScopeKey(scopeKey), storageReady: true });
    }

    const employeeEmail = params.get("employee") && user.role === "admin" ? params.get("employee")! : user.email;
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to) return NextResponse.json({ error: "missing_range" }, { status: 400 });

    const records = await listRecordsInRange(ownerKeyFor(employeeEmail, params.get("owner")), from, to);
    return NextResponse.json({ records, storageReady: true });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

/** PUT /api/work-records — upserts the signed-in user's document for one scope window. */
export async function PUT(request: Request) {
  const user = await requireUser();
  if (user.isImpersonating) {
    return NextResponse.json({ error: "read_only_view" }, { status: 403 });
  }
  if (storageMode() === "unavailable") {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { scope?: string; scopeKey?: string; owner?: string; data?: Record<string, unknown> }
    | null;

  if (!body || !isValidScope(body.scope) || !body.scopeKey || typeof body.data !== "object" || !body.data) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (JSON.stringify(body.data).length > MAX_WORK_RECORD_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const record: WorkRecordDoc = {
    employeeKey: ownerKeyFor(user.email, body.owner ?? null),
    employeeEmail: user.email,
    employeeName: user.name,
    branch: branchForEmail(user.email),
    scope: body.scope,
    scopeKey: body.scopeKey,
    data: body.data,
    updatedAt: new Date().toISOString(),
    updatedBy: user.actualEmail
  };

  try {
    await upsertRecord(record);
    return NextResponse.json({ ok: true, updatedAt: record.updatedAt });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
