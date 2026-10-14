import { NextResponse } from "next/server";
import { handoverActor, lookup, pendingOpenings, record, history } from "../../../lib/customer-handover-server.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "lookup";
    const branch = url.searchParams.get("branch") || "";
    const actor = await handoverActor(action === "opening" ? "approveOpening" : "read", action === "history" ? branch : undefined);
    if (action === "capabilities") return response({ grant: actor.grant });
    if (action === "opening") return response(await pendingOpenings());
    if (action === "history") { if (!branch) throw new Error("เลือกสาขา"); return response(await history(branch, url.searchParams.get("phone") || undefined)); }
    if (action !== "lookup") throw new Error("คำขอไม่ถูกต้อง");
    return response(await lookup(url.searchParams.get("phone") || ""));
  } catch (error) { return response({ error: error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ" }, 403); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "ต้นทางคำขอไม่ถูกต้อง" }, 403);
    if (Number(request.headers.get("content-length") || 0) > 24000) return response({ error: "คำขอใหญ่เกินไป" }, 413);
    const text = await request.text();
    if (text.length > 24000) return response({ error: "คำขอใหญ่เกินไป" }, 413);
    const input = JSON.parse(text);
    const actor = await handoverActor(input.type === "handover" ? "record" : "correct", input.branch);
    return response(await record(input, actor));
  } catch (error) { return response({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, 409); }
}
