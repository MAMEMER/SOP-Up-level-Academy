import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { isOwner } from "../../../lib/owner.ts";
import { periodFor, periodIdForDate, validateAdjustment, validateProfile, type AdjustmentKind, type EmploymentType } from "../../../lib/payroll.ts";
import { addAdjustment, loadPayroll, saveProfile, voidAdjustment } from "../../../lib/payroll-server.ts";

// เงินเดือนพนักงาน — เจ้าของร้านเท่านั้น (INVARIANTS §4: isOwner gate, ห้ามตอนสวมบทคนอื่น).
// แอป Up Level Owner เข้าผ่านเว็บกิลด์ด้วยกุญแจลับ OWNER_PAYROLL_KEY + อีเมลเจ้าของที่ยืนยันตัวตนแล้ว
// (เว็บกิลด์ตรวจ Firebase token เอง และส่งเฉพาะอีเมลที่อยู่ใน allowlist ของมัน — ที่นี่ตรวจซ้ำกับ OWNER_EMAILS).

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore });

async function ownerActor(request: Request): Promise<string | null> {
  if (request.headers.has("x-owner-payroll-key")) {
    const expected = process.env.OWNER_PAYROLL_KEY || "";
    const got = request.headers.get("x-owner-payroll-key") || "";
    if (expected.length < 32 || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
    const email = (request.headers.get("x-owner-email") || "").trim().toLowerCase();
    return isOwner(email) ? email : null;
  }
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) return null;
  return user.actualEmail;
}

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const by = await ownerActor(request);
  if (!by) return json({ error: "forbidden" }, 403);
  if (!hasAdminCredentials()) return json({ error: "storage_not_configured" }, 503);
  const periodId = new URL(request.url).searchParams.get("period") || periodIdForDate(bangkokToday());
  if (!periodFor(periodId)) return json({ error: "bad_period" }, 400);
  try {
    return json(await loadPayroll(periodId));
  } catch (error) {
    return json({ error: "read_failed", detail: String(error) }, 500);
  }
}

export async function POST(request: Request) {
  const by = await ownerActor(request);
  if (!by) return json({ error: "forbidden" }, 403);
  if (!hasAdminCredentials()) return json({ error: "storage_not_configured" }, 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ error: "missing_action" }, 400);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const codeOk = /^[A-Za-z0-9_-]{1,20}$/.test(code);
  try {
    if (body.action === "profile") {
      if (!codeOk) return json({ error: "bad_code" }, 400);
      const problem = validateProfile(body as { type: unknown });
      if (problem) return json({ error: "rejected", detail: problem }, 400);
      await saveProfile(
        code,
        { type: body.type as EmploymentType, monthlySalary: body.monthlySalary as number, dailyRate: body.dailyRate as number, otRatePerHour: body.otRatePerHour as number },
        by
      );
      return json({ ok: true });
    }
    if (body.action === "adjust") {
      if (!codeOk) return json({ error: "bad_code" }, 400);
      const periodId = String(body.periodId || "");
      if (!periodFor(periodId)) return json({ error: "bad_period" }, 400);
      const problem = validateAdjustment(body as { amount: unknown; reason: unknown; kind: unknown; hours?: unknown });
      if (problem) return json({ error: "rejected", detail: problem }, 400);
      const id = await addAdjustment(
        {
          code,
          periodId,
          kind: body.kind as AdjustmentKind,
          amount: Number(body.amount),
          reason: String(body.reason).slice(0, 300),
          hours: body.hours ? Number(body.hours) : null
        },
        by
      );
      return json({ ok: true, id });
    }
    if (body.action === "void") {
      const id = typeof body.id === "string" && /^[A-Za-z0-9]{10,40}$/.test(body.id) ? body.id : "";
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      if (!id) return json({ error: "bad_id" }, 400);
      if (reason.length < 3) return json({ error: "rejected", detail: "ต้องใส่เหตุผลที่ยกเลิก" }, 400);
      const problem = await voidAdjustment(id, reason, by);
      return problem ? json({ error: "rejected", detail: problem }, 400) : json({ ok: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    return json({ error: "write_failed", detail: String(error) }, 500);
  }
}
