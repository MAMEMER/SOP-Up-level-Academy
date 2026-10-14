import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actor, canWriteNow, db, readOnly, badRequest } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { hasSessionSecret } from "../../../lib/session-jwt.ts";
import { openingSchema, initialOpeningItems, mergeOpeningItems, newOpening, stampOpening, type OpeningItem } from "../../../lib/grand-opening-checklist.ts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const collection = "sop_grand_opening_checklist";
const available = () => hasAdminCredentials() && hasSessionSecret();
const idSchema = z.string().regex(/^[\w-]{1,100}$/);
export async function GET(request: Request) {
  await actor();
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id && !idSchema.safeParse(id).success) return badRequest();
  if (!available()) return NextResponse.json({ mode: "preview", rows: initialOpeningItems, history: [] });
  if (params.get("stream") === "1") {
    const encoder = new TextEncoder();
    let cleanup = (_close = true) => {};
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let unsubscribe = () => {};
        const finish = (close = true) => { if (closed) return; closed = true; unsubscribe(); clearTimeout(timeout); request.signal.removeEventListener("abort", abort); if (close) controller.close(); };
        const abort = () => finish();
        const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
        const timeout = setTimeout(() => finish(), 50000);
        cleanup = finish;
        request.signal.addEventListener("abort", abort, { once: true });
        unsubscribe = db().collection(collection).onSnapshot(snapshot => send("rows", { rows: mergeOpeningItems(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as OpeningItem))) }), () => { send("unavailable", {}); finish(); });
        if (closed) unsubscribe();
        if (request.signal.aborted) finish();
      },
      cancel() { cleanup(false); }
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  }
  try {
    if (id) {
      const events = await db().collection(collection).doc(id).collection("history").orderBy("at", "desc").limit(100).get();
      return NextResponse.json({ history: events.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
    }
    const rows = await db().collection(collection).get();
    return NextResponse.json({ mode: "shared", rows: mergeOpeningItems(rows.docs.map(doc => ({ ...doc.data(), id: doc.id } as OpeningItem))) });
  } catch { return NextResponse.json({ error: "โหลดข้อมูลทีมไม่ได้ กรุณาลองใหม่" }, { status: 503 }); }
}
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: idSchema, revision: z.number().int().nonnegative(), fields: openingSchema }).strict(),
  z.object({ action: z.literal("tick"), id: idSchema, revision: z.number().int().nonnegative(), done: z.boolean() }).strict(),
  z.object({ action: z.literal("delete"), id: idSchema, revision: z.number().int().nonnegative() }).strict()
]);
export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!available()) return NextResponse.json({ error: "ยังไม่พร้อมบันทึกข้อมูลทีม" }, { status: 503 });
  const parsed = mutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("ข้อมูลรายการไม่ถูกต้อง");
  const body = parsed.data;
  const ref = db().collection(collection).doc(body.id);
  const event = ref.collection("history").doc(randomUUID());
  try {
    const row = await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const previous = snap.exists ? { ...snap.data(), id: body.id } as OpeningItem : initialOpeningItems.find(item => item.id === body.id);
      if ((previous?.revision ?? 0) !== body.revision || previous?.deleted || (!previous && body.action !== "save")) throw new Error("conflict");
      const at = new Date().toISOString();
      const by = user.actualName;
      let next = previous ?? newOpening(body.id, body.action === "save" ? body.fields : openingSchema.parse({}), by, at);
      if (body.action === "save") next = { ...next, ...body.fields };
      if (body.action === "tick") next = stampOpening(next, body.done, by, at);
      if (body.action === "delete") next = { ...next, deleted: true };
      next = { ...next, revision: body.revision + 1, createdAt: next.createdAt ?? at, updatedBy: by, updatedAt: at };
      tx.set(ref, next);
      tx.create(event, { at, by, action: body.action, before: previous ?? null, after: next });
      return next;
    });
    return NextResponse.json({ row });
  } catch (error) {
    const conflict = error instanceof Error && error.message === "conflict";
    return NextResponse.json({ error: conflict ? "ทีมเพิ่งแก้รายการนี้ โหลดข้อมูลล่าสุดแล้วรีเซ็ตร่างเพื่อแก้ใหม่ ร่างเดิมยังอยู่" : "บันทึกไม่สำเร็จ ร่างยังอยู่ กรุณาลองใหม่" }, { status: conflict ? 409 : 503 });
  }
}
