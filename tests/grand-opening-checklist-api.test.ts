import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { emptyOpening } from "../lib/grand-opening-checklist.ts";
const state = { available: true, impersonating: false, denied: false, row: null as Record<string, unknown> | null, events: [] as Record<string, unknown>[], listeners: 0 };
const ref = (id: string) => ({ id, collection: () => ({ doc: () => ({ id: "history" }) }) });
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
    const result = await fn({ get: async () => ({ exists: !!state.row, data: () => state.row }), set: (_ref: unknown, data: Record<string, unknown>) => { pending = data; }, create: (_ref: unknown, data: Record<string, unknown>) => events.push(data) });
    state.row = pending; state.events.push(...events); return result;
  }
};
Object.assign(globalThis, { openingApiTest: { state, database } });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (!context.parentURL?.endsWith("/api/grand-opening-checklist/route.ts")) return next(specifier, context);
  let source: string | undefined;
  if (specifier === "next/server") source = "export const NextResponse = {json:(data, options) => Response.json(data,options)}";
  if (specifier.endsWith("api-firestore.ts")) source = `const t=globalThis.openingApiTest; export const actor=async()=>{if(t.state.denied)throw Error('unauthorized');return {user:{actualName:'เนม',isImpersonating:t.state.impersonating}}}; export const db=()=>t.database; export const canWriteNow=u=>!u.isImpersonating; export const readOnly=()=>Response.json({error:'read_only'},{status:403}); export const badRequest=()=>Response.json({error:'bad_request'},{status:400});`;
  if (specifier.endsWith("firebase-admin.ts")) source = "export const hasAdminCredentials=()=>globalThis.openingApiTest.state.available";
  if (specifier.endsWith("session-jwt.ts")) source = "export const hasSessionSecret=()=>globalThis.openingApiTest.state.available";
  return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { GET, POST } = await import("../app/api/grand-opening-checklist/route.ts");
hooks.deregister();
const currentRow = (): Record<string, unknown> | null => state.row;
const request = (body: unknown) => new Request("http://localhost/api/grand-opening-checklist", { method: "POST", body: JSON.stringify(body) });
test("API derives identity, commits before/after history, rejects stale revisions and spoofed metadata", async () => {
  state.row = null; state.events = [];
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
