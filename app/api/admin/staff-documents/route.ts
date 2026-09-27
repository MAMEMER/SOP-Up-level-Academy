import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, forbidden, isAdmin, readOnly } from "../../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { hasDriveBridge, listDocRecords, pushToDrive } from "../../../../lib/staff-documents-server.ts";
import { canRetryDrive, docsStatus } from "../../../../lib/staff-documents.ts";

// แอดมิน: ลองส่งเอกสารที่ค้างขึ้น Drive ใหม่ (ทีละคน หรือทุกคนที่ค้าง).
// ไม่คืนข้อมูลส่วนตัวใดๆ — แค่สถานะ.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { user } = await actor();
  if (!isAdmin(user)) return forbidden();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  if (!hasDriveBridge()) return NextResponse.json({ error: "drive_bridge_not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { docId?: unknown } | null;
  const records = await listDocRecords();
  const targets =
    typeof body?.docId === "string" && body.docId
      ? [body.docId].filter((id) => !id.includes("/"))
      : Array.from(records.keys());
  if (!targets.length) return badRequest("no_target");

  const results: Array<{ docId: string; status: string; error?: string }> = [];
  for (const docId of targets) {
    const record = records.get(docId);
    if (!canRetryDrive(record ?? null)) {
      results.push({ docId, status: docsStatus(record ?? null) });
      continue;
    }
    const after = await pushToDrive(docId, { attempts: 1 });
    results.push({ docId, status: docsStatus(after), ...(after?.driveError ? { error: after.driveError } : {}) });
  }
  return NextResponse.json({ ok: true, results });
}
