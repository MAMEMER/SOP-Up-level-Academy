import "server-only";
import { NextResponse } from "next/server";
import { StoreConflictError, StoreUnavailableError } from "./masterplan-store.ts";

// Shared bits for /api/masterplan/* routes. Every route first calls masterplanApiMember()
// (lib/masterplan-auth.ts); the acting member ALWAYS comes from the session, never the body.

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
export const bad = (error: string) => fail(400, error);
export const editorsOnly = () => fail(403, "เฉพาะแชมป์และท้อป (ผู้แก้ฉบับกลาง) เท่านั้น");

export function storeError(error: unknown) {
  if (error instanceof StoreConflictError) return fail(409, error.message);
  if (error instanceof StoreUnavailableError) return fail(503, "ที่เก็บข้อมูลยังไม่ได้ตั้งค่า");
  const message = error instanceof Error ? error.message : String(error);
  return fail(500, message.slice(0, 300));
}

export const text = (value: unknown): string => (typeof value === "string" ? value : "");
/** Ids come from the body; Firestore treats "a/b" as a path, so reject slashes outright. */
export const docId = (value: unknown): string => {
  const id = text(value).trim();
  return id && !id.includes("/") && id.length <= 160 ? id : "";
};
