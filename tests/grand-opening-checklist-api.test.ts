import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { initialOpeningBoard, type OpeningBoard, emptyOpening } from "../lib/grand-opening-checklist.ts";
const state = { board: undefined as OpeningBoard | undefined, available: true, impersonating: false, denied: false, row: null as Record<string, unknown> | null, events: [] as Record<string, unknown>[], listeners: 0, files: new Map<string, Uint8Array>(), failUpload: false };
const ref = (id: string) => ({ id, get: async () => ({ data: () => state.row }), collection: () => ({ doc: () => ({ id: "history" }) }) });
const database = {
  collection: () => ({
    doc: ref,
    get: async () => ({ docs: state.row ? [{ id: state.row.id, data: () => state.row }] : [] }),
    onSnapshot: (callback: (value: unknown) => void) => {
      state.listeners++;
      queueMicrotask(() => callback({ docs: state.row ? [{ id: state.row.id, data: () => state.row }] : [] }));
      return () => { state.listeners--; };
    }
  }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    let pending: Record<string, unknown> | null = null;
    const events: Record<string, unknown>[] = [];
    const result = await fn({ get: async (ref: { id: string }) => ({ exists: ref.id === "__board" ? !!state.board : !!state.row, data: () => ref.id === "__board" ? state.board : state.row }), set: (ref: { id: string }, data: Record<string, unknown>) => { if (ref.id === "__board") state.board = data as unknown as OpeningBoard; else pending = data; }, create: (_ref: unknown, data: Record<string, unknown>) => events.push(data) });
    if (pending) state.row = pending; state.events.push(...events); return result;
  }
};
Object.assign(globalThis, { openingApiTest: { state, database } });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (!context.parentURL?.endsWith("/api/grand-opening-checklist/route.ts")) return next(specifier, context);
  let source: string | undefined;
  if (specifier === "next/server") source = "export const NextResponse = {json:(data, options) => Response.json(data,options)}";
  if (specifier.endsWith("api-firestore.ts")) source = `const t=globalThis.openingApiTest; export const actor=async()=>{if(t.state.denied)throw Error('unauthorized');return {user:{actualName:'เนม',isImpersonating:t.state.impersonating}}}; export const db=()=>t.database; export const canWriteNow=u=>!u.isImpersonating; export const readOnly=()=>Response.json({error:'read_only'},{status:403}); export const badRequest=()=>Response.json({error:'bad_request'},{status:400});`;
  if (specifier.endsWith("firebase-admin.ts")) source = "export const hasAdminCredentials=()=>globalThis.openingApiTest.state.available; export const adminBucket=()=>({file:path=>({save:async bytes=>{const s=globalThis.openingApiTest.state;if(s.failUpload)throw Error('upload');s.files.set(path,bytes)},delete:async()=>globalThis.openingApiTest.state.files.delete(path),download:async()=>[globalThis.openingApiTest.state.files.get(path)]})})";
  if (specifier.endsWith("session-jwt.ts")) source = "export const hasSessionSecret=()=>globalThis.openingApiTest.state.available";
  return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { GET, POST } = await import("../app/api/grand-opening-checklist/route.ts");
hooks.deregister();
const currentBoard = (): OpeningBoard | undefined => state.board;
const currentRow = (): Record<string, unknown> | null => state.row;
const request = (body: unknown) => new Request("http://localhost/api/grand-opening-checklist", { method: "POST", body: JSON.stringify(body) });
test("API derives identity, commits before/after history, rejects stale revisions and spoofed metadata", async () => {
  state.row = null; state.events = [];
  assert.equal((await POST(request({ id: "__board", revision: 0, action: "save", fields: { ...emptyOpening, title: "ห้ามทับหมวด" } }))).status, 400);
  const created = await POST(request({ id: "custom", revision: 0, action: "save", fields: { ...emptyOpening, title: "โต๊ะ" } }));
  assert.equal(created.status, 200); assert.equal(currentRow()?.createdBy, "เนม"); assert.ok(currentRow()?.createdAt);
  assert.equal(state.events.length, 1); assert.equal(state.events[0].before, null);
  assert.equal((await POST(request({ id: "custom", revision: 0, action: "tick", done: true }))).status, 409);
  assert.equal(state.events.length, 1);
  assert.equal((await POST(request({ id: "custom", revision: 1, action: "tick", done: true, by: "ปลอม" }))).status, 400);
  assert.equal((await POST(request({ id: "custom", revision: 1, action: "tick", done: true }))).status, 200);
  assert.equal(currentRow()?.doneBy, "เนม"); assert.ok(currentRow()?.doneAt);
  assert.equal((await POST(request({ id: "custom", revision: 2, action: "tick", done: false }))).status, 200);
  assert.equal(currentRow()?.doneBy, null); assert.equal(currentRow()?.doneAt, null);
  assert.equal((await POST(request({ id: "custom", revision: 3, action: "delete" }))).status, 200);
  assert.equal(currentRow()?.deleted, true); assert.equal(state.events.length, 4);
  assert.equal((await POST(request({ id: "custom", revision: 4, action: "save", fields: { ...emptyOpening, title: "กลับมา" } }))).status, 409);
});
test("API blocks impersonation and missing credentials; all reads require actor", async () => {
  state.impersonating = true;
  assert.equal((await POST(request({}))).status, 403); state.impersonating = false;
  state.available = false;
  assert.equal((await POST(request({}))).status, 503);
  assert.equal((await (await GET(new Request("http://localhost/api"))).json()).mode, "preview");
  state.available = true; state.denied = true;
  await assert.rejects(GET(new Request("http://localhost/api?stream=1")), /unauthorized/); state.denied = false;
});
test("realtime sends a Firestore snapshot and releases listener on stream cancellation and abort", async () => {
  state.row = null;
  const response = await GET(new Request("http://localhost/api?stream=1"));
  assert.equal(response.headers.get("Content-Type"), "text/event-stream");
  const reader = response.body!.getReader();
  const chunk = await reader.read();
  assert.match(new TextDecoder().decode(chunk.value), /event: rows/); assert.match(new TextDecoder().decode(chunk.value), /โต๊ะ/);
  assert.equal(state.listeners, 1); await reader.cancel(); assert.equal(state.listeners, 0);
  const controller = new AbortController();
  const another = await GET(new Request("http://localhost/api?stream=1", { signal: controller.signal }));
  await another.body!.getReader().read(); controller.abort(); assert.equal(state.listeners, 0);
});

const photoRequest = (revision: number, type = "image/jpeg", size = 32) => {
  const form = new FormData(); form.append("id", "seed-0-0"); form.append("revision", String(revision));
  form.append("file", new File([new Uint8Array(size)], "โต๊ะ.jpg", { type }));
  form.append("thumbnail", new File([new Uint8Array(16)], "thumb.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/grand-opening-checklist", { method: "POST", body: form });
};
test("images upload to existing Storage, stamp session identity, audit atomically and remove from active item", async () => {
  state.row = null; state.events = []; state.files.clear();
  const response = await POST(photoRequest(0)); assert.equal(response.status, 200);
  const row = (await response.json()).row; const image = row.images[0];
  assert.equal(image.uploadedBy, "เนม"); assert.ok(image.uploadedAt); assert.equal(state.files.size, 2);
  assert.equal(state.events[0].action, "image-add"); assert.equal((state.events[0].before as Record<string, unknown>).images, undefined);
  const read = await GET(new Request(`http://localhost/api?id=seed-0-0&image=${image.id}&thumb=1`));
  assert.equal(read.status, 200); assert.equal(read.headers.get("content-type"), "image/jpeg");
  assert.equal((await POST(photoRequest(0))).status, 409); assert.equal(state.files.size, 2);
  assert.equal((await POST(request({ id: row.id, revision: 1, action: "image-delete", imageId: image.id }))).status, 200);
  assert.equal((currentRow()?.images as unknown[]).length, 0); assert.equal(state.events[1].action, "image-delete");
  assert.equal((await GET(new Request(`http://localhost/api?id=seed-0-0&image=${image.id}`))).status, 404);
  assert.equal((state.events[1].before as typeof row).images[0].id, image.id);
});
test("image writes reject invalid type/size, spoofed attachments, missing item, upload failures, read-only sessions and image limit", async () => {
  state.row = null; state.events = []; state.files.clear();
  assert.equal((await POST(photoRequest(0, "image/svg+xml"))).status, 400);
  assert.equal((await POST(photoRequest(0, "image/jpeg", 4 * 1024 * 1024 + 1))).status, 400);
  assert.equal((await POST(request({ id: "seed-0-0", revision: 0, action: "image-add" }))).status, 400);
  state.failUpload = true; assert.equal((await POST(photoRequest(0))).status, 503); state.failUpload = false;
  assert.equal(state.events.length, 0); assert.equal(state.files.size, 0);
  state.impersonating = true; assert.equal((await POST(photoRequest(0))).status, 403); state.impersonating = false;
  const uploaded = await (await POST(photoRequest(0))).json();
  state.row = { ...uploaded.row, images: Array.from({ length: 12 }, () => uploaded.row.images[0]) };
  assert.equal((await POST(photoRequest(1))).status, 400); assert.equal(state.files.size, 2);
  assert.equal((await POST(request({ id: "seed-0-0", revision: 1, action: "image-delete", imageId: "missing" }))).status, 409);
});

test("category CRUD/reorder is audited, revision guarded, and quantity changes stamp the session actor", async () => {
  state.board = undefined; state.row = null; state.events = [];
  let res = await POST(request({ action: "category-add", id: "custom-cat", name: "อุปกรณ์", revision: 0 }));
  assert.equal(res.status, 200); assert.equal(currentBoard()?.categories.at(-1)?.name, "อุปกรณ์");
  assert.equal(currentBoard()?.activity[0].by, "เนม");
  assert.equal((await POST(request({ action: "category-rename", id: "custom-cat", name: "ชื่อเก่า", revision: 0 }))).status, 409);
  assert.equal((await POST(request({ action: "category-rename", id: "custom-cat", name: "อุปกรณ์ใหม่", revision: 1 }))).status, 200);
  assert.equal((await POST(request({ action: "category-move", id: "custom-cat", direction: -1, revision: 2 }))).status, 200);
  assert.equal(currentBoard()?.categories[3].id, "custom-cat");
  assert.equal((await POST(request({ action: "save", id: "quantity-test", revision: 0, fields: { ...emptyOpening, category: "custom-cat", title: "สายไฟ" } }))).status, 200);
  assert.equal((await POST(request({ action: "quantity", id: "quantity-test", revision: 1, field: "qtyHave", delta: 1 }))).status, 200);
  assert.equal(currentRow()?.qtyHave, 1); assert.equal(currentBoard()?.activity[0].action, "quantity");
  assert.equal((await POST(request({ action: "quantity", id: "quantity-test", revision: 2, field: "qtyNeeded", delta: -1 }))).status, 200);
  assert.equal(currentRow()?.qtyNeeded, 0);
  assert.equal((await POST(request({ action: "quantity", id: "quantity-test", revision: 3, field: "qtyHave", value: 250 }))).status, 200);
  assert.equal(currentRow()?.qtyHave, 250);
  assert.equal((await POST(request({ action: "quantity", id: "quantity-test", revision: 4, field: "qtyHave", value: -5 }))).status, 400);
  assert.equal((await POST(request({ action: "category-delete", id: "custom-cat", revision: 3 }))).status, 200);
  assert.equal(currentBoard()?.categories.find(row => row.id === "custom-cat")?.deleted, true);
  assert.equal(state.events.at(-1)?.action, "category-delete");
  state.board = undefined; state.row = null;
});
