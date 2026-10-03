import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { listRecordsForScopeKey, listRecordsInRange, readRecord, storageMode, upsertRecord } from "../../../lib/work-records-store.ts";
import { formatWorkDate, preserveFirstSubmission, type WorkflowDailyRecord } from "../../../lib/workflow-records.ts";
import {
  MAX_WORK_RECORD_BYTES,
  employeeKeyFromEmail,
  isValidScope,
  teamKeyForBranch,
  type WorkRecordDoc
} from "../../../lib/work-records.ts";

export const dynamic = "force-dynamic";

/**
 * สาขาที่คนนี้ทำงานในวันนั้น = สาขาที่ลงกะไว้ (ไม่มีกะ = สาขาบ้าน). เช็คลิสต์ที่ติ๊กตอนไปเข้ากะ
 * อีกสาขาต้องไปอยู่สาขานั้น — เดิมใช้สาขาบ้านเสมอ ของเลยไปโผล่ผิดสาขา.
 */
async function branchForEmail(email: string, workDate = formatWorkDate()) {
  return workBranchFor(employeeCodeForEmail(email), workDate);
}

/** `d-2026-10-03` → `2026-10-03`; scope อื่น (weekly/monthly) ใช้วันนี้ */
function workDateOfScopeKey(scopeKey: string): string {
  const match = /^d-(\d{4}-\d{2}-\d{2})$/.exec(scopeKey);
  return match ? match[1] : formatWorkDate();
}

function keyForEmail(email: string) {
  return employeeKeyFromEmail(email, employeeCodeForEmail(email));
}

/** "team" records are shared per branch; anything else is the person's own record. */
async function ownerKeyFor(email: string, owner: string | null) {
  return owner === "team" ? teamKeyForBranch(await branchForEmail(email)) : keyForEmail(email);
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

    const records = await listRecordsInRange(await ownerKeyFor(employeeEmail, params.get("owner")), from, to);
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

  const employeeKey = await ownerKeyFor(user.email, body.owner ?? null);
  let data = body.data;

  // กดส่งซ้ำต้องไม่เลื่อนเวลาส่งให้ช้าลง — ตัดสินจากเอกสารที่เก็บอยู่จริง ไม่ใช่จากสิ่งที่
  // เบราว์เซอร์ส่งมา (แท็บที่เปิดค้างไว้จะมีข้อมูลเก่าและส่งเวลาปัจจุบันมาทับ)
  if (body.scope === "daily" && Array.isArray((data as { records?: unknown }).records)) {
    const stored = await readRecord(employeeKey, body.scopeKey);
    const before = (stored?.data as { records?: WorkflowDailyRecord[] } | undefined)?.records;
    if (before?.length) {
      data = { ...data, records: preserveFirstSubmission(before, (data as { records: WorkflowDailyRecord[] }).records) };
    }
  }

  const record: WorkRecordDoc = {
    employeeKey,
    employeeEmail: user.email,
    employeeName: user.name,
    branch: await branchForEmail(user.email, workDateOfScopeKey(body.scopeKey)),
    scope: body.scope,
    scopeKey: body.scopeKey,
    data,
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
