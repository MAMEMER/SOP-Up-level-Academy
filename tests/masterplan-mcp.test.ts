import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { memberByKey } from "../lib/masterplan-access.ts";
import {
  LATEST_PROTOCOL_VERSION,
  READ_CAP,
  RPC,
  TOOLS,
  handleBody,
  handleMessage,
  readSectionText,
  resolveSection,
  searchDocs,
  type McpContext
} from "../lib/masterplan-mcp.ts";
import {
  MAX_ACTIVE_TOKENS,
  createRateLimiter,
  createToken,
  generateToken,
  hashToken,
  listMyTokens,
  looksLikeToken,
  revokeToken,
  touchToken,
  verifyToken,
  type MpStore,
  type MpToken
} from "../lib/masterplan-tokens.ts";
import type { MpChangelog, MpDoc, MpProposal, MpScratch, MpTask } from "../lib/masterplan.ts";
import { editDocSection } from "../lib/masterplan-docs.ts";

// In-memory store with the same surface as masterplan-store.ts. Dummy text only.
function memoryStore(): MpStore & { data: Map<string, Map<string, unknown>> } {
  const data = new Map<string, Map<string, unknown>>();
  const col = (name: string) => {
    if (!data.has(name)) data.set(name, new Map());
    return data.get(name) as Map<string, unknown>;
  };
  const seq: Record<string, number> = {};
  return {
    data,
    async getOne<T>(c: string, id: string) {
      return (structuredClone(col(c).get(id)) as T) ?? null;
    },
    async listAll<T>(c: string) {
      return [...col(c).values()].map((v) => structuredClone(v) as T);
    },
    async putOne<T extends object>(c: string, id: string, value: T) {
      col(c).set(id, structuredClone(value));
    },
    async updateOne<T extends object, R = T>(c: string, id: string, mutate: (current: T | null) => { data: T; result: R } | null) {
      const next = mutate((structuredClone(col(c).get(id)) as T) ?? null);
      if (!next) return null;
      col(c).set(id, structuredClone(next.data));
      return next.result;
    },
    async nextSequence(name: "proposal" | "task") {
      seq[name] = (seq[name] ?? 0) + 1;
      return seq[name];
    }
  };
}

const NOW = new Date("2026-10-27T03:00:00Z");
const bigBody = "ข้อความยาว ".repeat(4000);
const MASTER = `Intro dummy.\n\n# Alpha\nalpha dummy body\n\n## Alpha child\nchild dummy\n\n# Beta\nbeta dummy ${"x".repeat(50)}\n\n# Huge\n${bigBody}\n`;

let store: ReturnType<typeof memoryStore>;
let ctx: McpContext;
const call = (name: string, args: Record<string, unknown> = {}, c: McpContext = ctx) =>
  handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, c);
const textOf = (res: Awaited<ReturnType<typeof call>>) => ((res?.result as { content: { text: string }[] }).content[0].text);
const isErr = (res: Awaited<ReturnType<typeof call>>) => Boolean((res?.result as { isError?: boolean }).isError);

beforeEach(async () => {
  store = memoryStore();
  ctx = { member: memberByKey("top")!, tokenLabel: "Claude ของท้อป", store, now: () => NOW };
  await store.putOne<MpDoc>("mp_docs", "master", { slug: "master", title: "ฉบับกลาง", markdown: MASTER, version: 1, updatedAt: NOW.toISOString(), updatedBy: "champ" });
});

describe("tokens", () => {
  it("generates prefixed base64url tokens with ≥32 random bytes, hashes deterministically", () => {
    const a = generateToken();
    const b = generateToken();
    assert.match(a, /^mp_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
    assert.ok(looksLikeToken(a));
    assert.equal(hashToken(a), hashToken(a));
    assert.match(hashToken(a), /^[a-f0-9]{64}$/);
    assert.equal(looksLikeToken("mp_short"), false);
    assert.equal(looksLikeToken("../../etc"), false);
  });
  it("stores only the hash; verify → member; revoke is immediate", async () => {
    const created = await createToken(store, "top", "Claude ของท้อป", NOW);
    assert.ok(created.ok);
    if (!created.ok) return;
    const stored = [...store.data.get("mp_tokens")!.entries()];
    assert.equal(stored.length, 1);
    assert.equal(stored[0][0], hashToken(created.token));
    assert.ok(!JSON.stringify(stored).includes(created.token));
    assert.equal((await verifyToken(store, created.token))?.member.key, "top");
    assert.equal(await verifyToken(store, generateToken()), null);
    assert.equal(await revokeToken(store, "name", created.record.hash), false); // not mine
    assert.ok(await verifyToken(store, created.token));
    assert.equal(await revokeToken(store, "top", created.record.hash), true);
    assert.equal(await verifyToken(store, created.token), null);
  });
  it("caps active tokens per member, revoked ones don't count, scoping per member", async () => {
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i += 1) assert.ok((await createToken(store, "name", `t${i}`)).ok);
    assert.equal((await createToken(store, "name", "one more")).ok, false);
    assert.ok((await createToken(store, "muk", "muk's")).ok);
    const mine = await listMyTokens(store, "name");
    assert.equal(mine.length, MAX_ACTIVE_TOKENS);
    await revokeToken(store, "name", mine[0].hash);
    assert.ok((await createToken(store, "name", "after revoke")).ok);
    assert.equal((await createToken(store, "name", "  ")).ok, false);
  });
  it("lastUsedAt is written at most once a minute", async () => {
    const created = await createToken(store, "top", "x", NOW);
    if (!created.ok) return assert.fail();
    await touchToken(store, created.record, NOW);
    const first = (await store.getOne<MpToken>("mp_tokens", created.record.hash))!;
    assert.equal(first.lastUsedAt, NOW.toISOString());
    await touchToken(store, first, new Date(NOW.getTime() + 30_000));
    assert.equal((await store.getOne<MpToken>("mp_tokens", created.record.hash))!.lastUsedAt, NOW.toISOString());
    await touchToken(store, first, new Date(NOW.getTime() + 61_000));
    assert.notEqual((await store.getOne<MpToken>("mp_tokens", created.record.hash))!.lastUsedAt, NOW.toISOString());
  });
  it("rate limiter", () => {
    const limited = createRateLimiter(3, 60_000);
    assert.deepEqual([1, 2, 3, 4].map(() => limited("k", 1000)), [false, false, false, true]);
    assert.equal(limited("k", 70_000), false);
    assert.equal(limited("other", 1000), false);
  });
});

describe("JSON-RPC", () => {
  it("initialize negotiates the protocol version", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, ctx);
    const result = res?.result as { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string } };
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.ok(result.capabilities.tools);
    assert.equal(result.serverInfo.name, "up-level-masterplan");
    const unknown = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx);
    assert.equal((unknown?.result as { protocolVersion: string }).protocolVersion, LATEST_PROTOCOL_VERSION);
  });
  it("notifications get no response; batch returns only request responses", async () => {
    assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
    assert.equal((await handleBody({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).responses, null);
    const batch = await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 7, method: "ping" }], ctx);
    assert.deepEqual(batch.responses, [{ jsonrpc: "2.0", id: 7, result: {} }]);
    assert.equal(((await handleBody([], ctx)).responses as { error: { code: number } }).error.code, RPC.INVALID_REQUEST);
  });
  it("errors: unknown method -32601, invalid request -32600, bad params -32602", async () => {
    assert.equal((await handleMessage({ jsonrpc: "2.0", id: 1, method: "resources/list" }, ctx))?.error?.code, RPC.METHOD_NOT_FOUND);
    assert.equal((await handleMessage({ id: 1, method: "ping" }, ctx))?.error?.code, RPC.INVALID_REQUEST);
    assert.equal((await handleMessage("nope", ctx))?.error?.code, RPC.INVALID_REQUEST);
    assert.equal((await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} }, ctx))?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_doc", arguments: [] } }, ctx))?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await call("read_doc", {}))?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await call("read_doc", { slug: "nope" }))?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await call("list_tasks", { status: "??" }))?.error?.code, RPC.INVALID_PARAMS);
  });
});

describe("tool permission matrix", () => {
  const allowed = [
    "get_overview",
    "read_doc",
    "search_docs",
    "list_proposals",
    "create_proposal",
    "update_my_proposal",
    "read_scratch",
    "write_my_scratch",
    "list_tasks",
    "create_task",
    "claim_task",
    "set_task_status"
  ];
  const forbidden = ["decide_proposal", "set_verdict", "close_meeting", "apply_proposal", "edit_section", "import_doc", "import_tasks", "create_token", "revoke_token", "write_scratch", "delete_proposal"];
  const listFor = async (c: McpContext) =>
    ((await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, c))?.result as { tools: { name: string }[] }).tools.map((t) => t.name).sort();
  it("tools/list is exactly the allowed set (+ edit_reference_section for editors only)", async () => {
    assert.deepEqual(await listFor(ctx), [...allowed, "edit_reference_section"].sort()); // ท้อป = editor
    assert.deepEqual(await listFor({ ...ctx, member: memberByKey("name")! }), [...allowed].sort());
    assert.deepEqual(await listFor({ ...ctx, member: memberByKey("muk")! }), [...allowed].sort());
    for (const tool of TOOLS) assert.equal((tool.inputSchema as { type: string }).type, "object");
  });
  it("forbidden tools are rejected if called", async () => {
    for (const name of forbidden) assert.equal((await call(name, {}))?.error?.code, RPC.INVALID_PARAMS, name);
  });
});

describe("tools act as the token's member", () => {
  it("create_proposal → ร่าง/รอคุย, proposer = me, via ai-token, sequential codes", async () => {
    const draft = { title: "ข้อเสนอสมมติ", missions: ["A"], kind: "แก้", location: "Alpha", oldText: "alpha dummy body", newText: "new dummy", reason: "r" };
    assert.match(textOf(await call("create_proposal", draft)), /P-001/);
    assert.match(textOf(await call("create_proposal", { ...draft, submit: true })), /P-002/);
    const all = await store.listAll<MpProposal>("mp_proposals");
    assert.deepEqual(all.map((p) => [p.code, p.status, p.proposer, p.via, p.viaLabel]), [
      ["P-001", "ร่าง", "top", "ai-token", "Claude ของท้อป"],
      ["P-002", "รอคุย", "top", "ai-token", "Claude ของท้อป"]
    ]);
    assert.ok(isErr(await call("create_proposal", { ...draft, oldText: "" })));
  });
  it("update_my_proposal only touches my own ร่าง/รอคุย", async () => {
    const base = { title: "t", missions: ["B"], kind: "เพิ่ม", newText: "n" };
    await call("create_proposal", base);
    const nameCtx = { ...ctx, member: memberByKey("name")!, tokenLabel: "Claude ของเนม" };
    await call("create_proposal", base, nameCtx); // P-002 by เนม
    assert.ok(isErr(await call("update_my_proposal", { code: "P-002", title: "hijack" })));
    assert.equal((await store.getOne<MpProposal>("mp_proposals", "P-002"))!.title, "t");
    assert.ok(!isErr(await call("update_my_proposal", { code: "p-001", title: "แก้แล้ว", submit: true })));
    const mine = (await store.getOne<MpProposal>("mp_proposals", "P-001"))!;
    assert.equal(mine.title, "แก้แล้ว");
    assert.equal(mine.status, "รอคุย");
    await store.updateOne<MpProposal>("mp_proposals", "P-001", (c) => (c ? { data: { ...c, status: "ลง" }, result: c } : null));
    assert.ok(isErr(await call("update_my_proposal", { code: "P-001", title: "too late" })));
  });
  it("list_proposals hides other people's drafts", async () => {
    const nameCtx = { ...ctx, member: memberByKey("name")!, tokenLabel: "x" };
    await call("create_proposal", { title: "secret draft", missions: ["A"], kind: "คำถาม" }, nameCtx);
    assert.ok(!textOf(await call("list_proposals")).includes("secret draft"));
    assert.ok(textOf(await call("list_proposals", {}, nameCtx)).includes("secret draft"));
  });
  it("write_my_scratch writes only my own pad; append adds a dated block", async () => {
    await store.putOne<MpScratch>("mp_scratch", "name", { member: "name", markdown: "เนม's notes", updatedAt: "" });
    await call("write_my_scratch", { markdown: "first", mode: "replace" });
    await call("write_my_scratch", { markdown: "second", mode: "append" });
    const mine = (await store.getOne<MpScratch>("mp_scratch", "top"))!;
    assert.match(mine.markdown, /^first\n\n### 2026-10-27 10:00 \(จาก AI: Claude ของท้อป\)\nsecond\n$/);
    assert.equal(mine.via, "ai-token");
    assert.equal((await store.getOne<MpScratch>("mp_scratch", "name"))!.markdown, "เนม's notes");
    assert.equal((await call("write_my_scratch", { markdown: "x", mode: "replace", member: "name" }))?.result !== undefined, true); // extra arg ignored, still mine
    assert.equal((await store.getOne<MpScratch>("mp_scratch", "name"))!.markdown, "เนม's notes");
    assert.ok(textOf(await call("read_scratch", { member: "name" })).includes("เนม's notes"));
    assert.equal((await call("write_my_scratch", { markdown: "x", mode: "overwrite" }))?.error?.code, RPC.INVALID_PARAMS);
  });
  it("tasks: create, claim, status, filters", async () => {
    assert.match(textOf(await call("create_task", { title: "งานสมมติ", missions: ["C"], due: "2026-10-01" })), /T-001/);
    assert.ok(isErr(await call("create_task", { title: "x", owner: "me", due: "2026-13-01" })));
    await call("claim_task", { code: "T-001" });
    let task = (await store.getOne<MpTask>("mp_tasks", "T-001"))!;
    assert.equal(task.owner, "top");
    assert.equal(task.status, "กำลังทำ");
    assert.ok(JSON.parse(textOf(await call("list_tasks", { overdueOnly: true }))).length === 1);
    await call("set_task_status", { code: "T-001", status: "เสร็จ" });
    task = (await store.getOne<MpTask>("mp_tasks", "T-001"))!;
    assert.equal(task.status, "เสร็จ");
    assert.equal(task.via, "ai-token");
    assert.ok(isErr(await call("claim_task", { code: "T-404" })));
  });
});

describe("reading docs", () => {
  it("read_doc without section returns a TOC, never the whole doc", async () => {
    const text = textOf(await call("read_doc", { slug: "master" }));
    assert.ok(text.includes("1: Alpha"));
    assert.ok(text.includes("2: Alpha child"));
    assert.ok(!text.includes("alpha dummy body"));
  });
  it("read_doc by index or heading text; sub-sections included", async () => {
    assert.ok(textOf(await call("read_doc", { slug: "master", section: 1 })).includes("child dummy"));
    assert.ok(textOf(await call("read_doc", { slug: "master", section: "beta" })).includes("beta dummy"));
    assert.ok(isErr(await call("read_doc", { slug: "master", section: "nothing like this" })));
    assert.ok(isErr(await call("read_doc", { slug: "roadmap" })));
  });
  it("a huge section is capped", () => {
    const index = resolveSection(MASTER, "Huge")!;
    assert.ok(bigBody.length > READ_CAP);
    const text = readSectionText(MASTER, index);
    assert.ok(text.length <= READ_CAP + 400);
    assert.ok(text.includes("truncated"));
  });
  it("search_docs is case-insensitive with slug/section/snippet", async () => {
    const hits = searchDocs([{ slug: "master", markdown: MASTER }], "ALPHA DUMMY");
    assert.equal(hits[0].slug, "master");
    assert.equal(hits[0].section, 1);
    assert.ok(hits[0].snippet.includes("alpha dummy"));
    assert.ok(textOf(await call("search_docs", { query: "zzzz" })).includes("no matches"));
  });
  it("get_overview has me, rules, counts, docs", async () => {
    const data = JSON.parse(textOf(await call("get_overview")));
    assert.equal(data.me.key, "top");
    assert.equal(data.today, "2026-10-27");
    assert.ok(data.rules.some((r: string) => r.includes("ห้ามแต่งตัวเลข")));
    assert.ok(data.docs[0].sections.includes("1: Alpha"));
    assert.equal(data.docs.find((d: { slug: string }) => d.slug === "roadmap").imported, false);
  });
});

describe("editing reference docs", () => {
  const REF = "# One\nref one body\n\n# Two\nref two body\n";
  beforeEach(async () => {
    await store.putOne<MpDoc>("mp_docs", "mission-b", { slug: "mission-b", title: "Mission B (สมมติ)", markdown: REF, version: 4, updatedAt: "", updatedBy: "champ" });
  });
  const edit = (args: Record<string, unknown>, c: McpContext = ctx) =>
    call("edit_reference_section", { slug: "mission-b", section: "Two", baseVersion: 4, newBody: "ref two NEW\n", reason: "เหตุผลสมมติ", ...args }, c);

  it("editor token edits one section: version+1, changelog names the doc, via ai-token", async () => {
    const res = await edit({});
    assert.ok(!isErr(res), textOf(res));
    const doc = (await store.getOne<MpDoc>("mp_docs", "mission-b"))!;
    assert.equal(doc.version, 5);
    assert.equal(doc.markdown, "# One\nref one body\n\n# Two\nref two NEW\n");
    assert.equal(doc.updatedBy, "top");
    const [line] = await store.listAll<MpChangelog>("mp_changelog");
    assert.equal(line.version, 5);
    assert.equal(line.slug, "mission-b");
    assert.ok(line.summary.includes("Mission B (สมมติ)"));
    assert.ok(line.summary.includes("Two"));
    assert.equal(line.via, "ai-token");
  });
  it("non-editor token: tool is absent and rejected", async () => {
    const res = await edit({}, { ...ctx, member: memberByKey("name")!, tokenLabel: "x" });
    assert.equal(res?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await store.getOne<MpDoc>("mp_docs", "mission-b"))!.version, 4);
  });
  it("master is rejected via token even for an editor", async () => {
    const res = await edit({ slug: "master", section: "Alpha", baseVersion: 1 });
    assert.ok(isErr(res));
    assert.ok(textOf(res).includes("create_proposal"));
    assert.equal((await store.getOne<MpDoc>("mp_docs", "master"))!.markdown, MASTER);
  });
  it("version conflict writes nothing", async () => {
    const res = await edit({ baseVersion: 3 });
    assert.ok(isErr(res));
    assert.ok(textOf(res).includes("v4"));
    assert.equal((await store.getOne<MpDoc>("mp_docs", "mission-b"))!.markdown, REF);
    assert.equal((await store.listAll("mp_changelog")).length, 0);
  });
  it("reason required; bad baseVersion is a params error", async () => {
    assert.equal((await edit({ reason: "" }))?.error?.code, RPC.INVALID_PARAMS);
    assert.equal((await edit({ baseVersion: "4" }))?.error?.code, RPC.INVALID_PARAMS);
  });
  it("web path (editDocSection) checks baseBody too and edits master or references", async () => {
    const stale = await editDocSection(store, { slug: "mission-b", sectionIndex: 2, baseVersion: 4, baseBody: "old copy", newBody: "x", reason: "r", by: "champ" });
    assert.equal(stale.ok, false);
    const fine = await editDocSection(store, { slug: "mission-b", sectionIndex: 1, baseVersion: 4, baseBody: "ref one body\n\n", newBody: "one NEW", reason: "r", by: "champ" });
    assert.ok(fine.ok);
    assert.ok((await store.getOne<MpDoc>("mp_docs", "mission-b"))!.markdown.startsWith("# One\none NEW\n\n# Two"));
    const conflict = await editDocSection(store, { slug: "mission-b", sectionIndex: 1, baseVersion: 4, newBody: "y", reason: "r", by: "champ" });
    assert.ok(!conflict.ok && conflict.conflict);
  });
});
