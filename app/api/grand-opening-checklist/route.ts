import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actor, canWriteNow, db, readOnly, badRequest } from "../../../lib/api-firestore.ts";
import { adminBucket, hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { hasSessionSecret } from "../../../lib/session-jwt.ts";
import { openingSchema, initialOpeningItems, mergeOpeningItems, newOpening, stampOpening, MAX_OPENING_IMAGES, validOpeningImage, type OpeningImage, type OpeningItem } from "../../../lib/grand-opening-checklist.ts";
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
  const imageId = params.get("image");
  if (imageId) {
    if (!id || !idSchema.safeParse(imageId).success) return badRequest();
    try {
      const snap = await db().collection(collection).doc(id).get();
      const row = snap.data() as OpeningItem | undefined;
      const image = row?.images?.find(image => image.id === imageId);
      if (!image || row?.deleted) return NextResponse.json({ error: "ไม่พบรูป" }, { status: 404 });
      const [buffer] = await adminBucket().file(params.get("thumb") === "1" ? image.thumbnailPath : image.path).download();
      return new Response(new Uint8Array(buffer), { headers: { "Content-Type": params.get("thumb") === "1" ? "image/jpeg" : image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch { return NextResponse.json({ error: "โหลดรูปไม่ได้" }, { status: 503 }); }
  }
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
  z.object({ action: z.literal("image-delete"), id: idSchema, revision: z.number().int().nonnegative(), imageId: idSchema }).strict(),
  z.object({ action: z.literal("delete"), id: idSchema, revision: z.number().int().nonnegative() }).strict()
]);
export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!available()) return NextResponse.json({ error: "ยังไม่พร้อมบันทึกข้อมูลทีม" }, { status: 503 });
  let attachment: OpeningImage | undefined;
  let input: unknown;
  const uploadedPaths: string[] = [];
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const id = String(form?.get("id") || "");
    const revision = Number(form?.get("revision"));
    const file = form?.get("file");
    const thumbnail = form?.get("thumbnail");
    if (!idSchema.safeParse(id).success || !form?.has("revision") || !Number.isInteger(revision) || revision < 0 || !(file instanceof File) || !validOpeningImage(file.type, file.size) || !(thumbnail instanceof File) || thumbnail.type !== "image/jpeg" || thumbnail.size <= 0 || thumbnail.size > 100000) return badRequest("รับรูป JPG, PNG, WebP หรือ GIF ไม่เกิน 4MB พร้อมภาพย่อ");
    const imageId = randomUUID();
    const path = `sop-grand-opening/${id}/${imageId}`;
    attachment = { id: imageId, path, thumbnailPath: `${path}-thumb`, name: file.name.slice(0, 200), mimeType: file.type, size: file.size, uploadedBy: user.actualName, uploadedAt: new Date().toISOString() };
    try {
      for (const [target, source] of [[path, file], [attachment.thumbnailPath, thumbnail]] as const) {
        uploadedPaths.push(target);
        await adminBucket().file(target).save(Buffer.from(await source.arrayBuffer()), { resumable: false, contentType: source.type, metadata: { cacheControl: "private, no-store" } });
      }
    } catch {
      await Promise.all(uploadedPaths.map(path => adminBucket().file(path).delete({ ignoreNotFound: true }).catch(() => undefined)));
      return NextResponse.json({ error: "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
    }
    input = { id, revision, action: "image-add" };
  } else input = await request.json().catch(() => null);
  const parsed = z.union([mutation, z.object({ action: z.literal("image-add"), id: idSchema, revision: z.number().int().nonnegative() }).strict()]).safeParse(input);
  if (!parsed.success) return badRequest("ข้อมูลรายการไม่ถูกต้อง");
  const body = parsed.data;
  if (body.action === "image-add" && !attachment) return badRequest("ใช้ช่องแนบรูปเพื่ออัปโหลด");
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
      if (body.action === "image-add") {
        if ((next.images?.length || 0) >= MAX_OPENING_IMAGES) throw new Error("image_limit");
        next = { ...next, images: [...(next.images || []), attachment!] };
      }
      if (body.action === "image-delete") {
        if (!next.images?.some(image => image.id === body.imageId)) throw new Error("conflict");
        next = { ...next, images: next.images.filter(image => image.id !== body.imageId) };
      }
      next = { ...next, revision: body.revision + 1, createdAt: next.createdAt ?? at, updatedBy: by, updatedAt: at };
      tx.set(ref, next);
      tx.create(event, { at, by, action: body.action, before: previous ?? null, after: next });
      return next;
    });
    return NextResponse.json({ row });
  } catch (error) {
    await Promise.all(uploadedPaths.map(path => adminBucket().file(path).delete({ ignoreNotFound: true }).catch(() => undefined)));
    if (error instanceof Error && error.message === "image_limit") return NextResponse.json({ error: "แนบได้สูงสุด 12 รูปต่อรายการ" }, { status: 400 });
    const conflict = error instanceof Error && error.message === "conflict";
    return NextResponse.json({ error: conflict ? "ทีมเพิ่งแก้รายการนี้ โหลดข้อมูลล่าสุดแล้วรีเซ็ตร่างเพื่อแก้ใหม่ ร่างเดิมยังอยู่" : "บันทึกไม่สำเร็จ ร่างยังอยู่ กรุณาลองใหม่" }, { status: conflict ? 409 : 503 });
  }
}
