import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { memberByKey } from "../lib/masterplan-access.ts";
import {
  KPI_COLLECTION,
  countsByMission,
  createTaskFromStep,
  groupKpis,
  importKpis,
  mergeImportedKpi,
  openStepsByWho,
  ownerFromWho,
  parseKpiImport,
  setStepDone,
  sparklinePoints,
  stepId,
  updateKpi,
  validateKpiPatch,
  validateKpiRow,
  type MpKpi
} from "../lib/masterplan-kpi.ts";
import { handleMessage, toolList, type McpContext } from "../lib/masterplan-mcp.ts";
import type { MpStore } from "../lib/masterplan-tokens.ts";
import type { MpChangelog, MpTask } from "../lib/masterplan.ts";

// Dummy data only — the repo is public; real KPIs arrive by import.

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

const TODAY = "2026-10-27";
const NOW = new Date("2026-10-27T03:00:00Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    code: "X1-01",
    mission: "A",
    dimension: "มิติทดสอบ",
    name: "ตัวชี้วัดทดสอบ",
    tier: "หลัก",
    unit: "หน่วย",
    direction: "สูงดี",
    definition: "นิยามทดสอบ",
    status: "วัดได้บางส่วน",
    dataSources: [{ system: "ระบบ-ก", fields: ["f1", "f2"], coverage: "บางส่วน" }],
    baseline: { value: 10, period: "2026-Q3", branch: "", method: "นับทดสอบ", n: 5 },
    series: [
      { period: "2026-07", branch: "", value: 8 },
      { period: "2026-08", branch: "", value: 10 }
    ],
    gaps: ["ช่องว่างทดสอบ"],
    nextSteps: [
      { action: "ทำขั้นหนึ่ง", who: "ท้อป", effort: "S" },
      { action: "ทำขั้นสอง", who: "ฝ่ายทดสอบ", effort: "L" }
    ],
    confidence: "กลาง",
    source: "audit-2026-10-20",
    ...overrides
  };
}

describe("KPI row validation", () => {
  it("accepts a full row and normalises fields", () => {
    const res = validateKpiRow(row(), TODAY);
    assert.ok(res.ok);
    assert.equal(res.value.dataSources[0].fields, "f1, f2");
    assert.equal(res.value.nextSteps[0].id, stepId("ทำขั้นหนึ่ง"));
    assert.equal(res.value.series?.length, 2);
  });

  it("defaults source to audit-<today> and confidence to กลาง", () => {
    const res = validateKpiRow(row({ source: undefined, confidence: undefined }), TODAY);
    assert.ok(res.ok);
    assert.equal(res.value.source, `audit-${TODAY}`);
    assert.equal(res.value.confidence, "กลาง");
  });

  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["missing code", { code: "" }, /ไม่มี code/],
    ["slash in code", { code: "a/b" }, /code/],
    ["bad mission", { mission: "E" }, /mission/],
    ["bad tier", { tier: "พิเศษ" }, /tier/],
    ["bad status", { status: "ดี" }, /status/],
    ["bad direction", { direction: "ขึ้น" }, /direction/],
    ["baseline without method", { baseline: { value: 1, period: "p" } }, /method/],
    ["series non-number", { series: [{ period: "p", value: "abc" }] }, /series/],
    ["bad effort", { nextSteps: [{ action: "a", effort: "XL" }] }, /effort/],
    ["bad source", { source: "somewhere" }, /source/]
  ];
  for (const [label, override, pattern] of bad) {
    it(`rejects ${label} with a Thai message`, () => {
      const res = validateKpiRow(row(override), TODAY);
      assert.equal(res.ok, false);
      if (!res.ok) assert.match(res.error, pattern);
    });
  }

  it("parseKpiImport reports bad rows and duplicates but keeps good ones", () => {
    const text = JSON.stringify([row(), row({ code: "X1-02", mission: "Z" }), row()]);
    const res = parseKpiImport(text, TODAY);
    assert.ok(res.ok);
    assert.equal(res.value.rows.length, 1);
    assert.equal(res.value.errors.length, 2);
    assert.equal(res.value.errors[0].row, 2);
    assert.match(res.value.errors[1].error, /ซ้ำ/);
  });

  it("parseKpiImport refuses non-arrays and broken JSON", () => {
    assert.equal(parseKpiImport("{", TODAY).ok, false);
    assert.equal(parseKpiImport('{"a":1}', TODAY).ok, false);
    assert.ok(parseKpiImport(JSON.stringify({ kpis: [row()] }), TODAY).ok);
  });

  it("import never takes a target from the payload", () => {
    const res = validateKpiRow(row({ target: { value: 99, period: "2027", note: "" } }), TODAY);
    assert.ok(res.ok);
    const merged = mergeImportedKpi(null, res.value, "champ", NOW.toISOString());
    assert.equal(merged.target, null);
  });
});

describe("KPI import upsert", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
  });

  async function runImport(rows: Record<string, unknown>[]) {
    const parsed = parseKpiImport(JSON.stringify(rows), TODAY);
    assert.ok(parsed.ok);
    return importKpis(store, parsed.value.rows, parsed.value.errors, "champ", NOW);
  }

  it("creates, then updates by code, and writes a changelog line", async () => {
    const first = await runImport([row(), row({ code: "X1-02" })]);
    assert.deepEqual(first.created, ["X1-01", "X1-02"]);
    const second = await runImport([row({ status: "วัดได้แล้ว" }), row({ code: "X1-03", mission: "Q" })]);
    assert.deepEqual(second.updated, ["X1-01"]);
    assert.equal(second.skipped.length, 1);
    const saved = await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01");
    assert.equal(saved?.status, "วัดได้แล้ว");
    const log = await store.listAll<MpChangelog>("mp_changelog");
    assert.equal(log.length, 2);
    assert.ok(log.every((l) => l.slug === "kpis" && /นำเข้าสถานะตัวชี้วัด \d+ รายการ/.test(l.summary)));
  });

  it("never overwrites an existing non-null target", async () => {
    await runImport([row()]);
    await store.updateOne<MpKpi>(KPI_COLLECTION, "X1-01", (cur) => (cur ? { data: { ...cur, target: { value: 50, period: "2027", note: "ตกลงในที่ประชุม" } }, result: cur } : null));
    await runImport([row({ target: null, name: "ชื่อใหม่" })]);
    const saved = await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01");
    assert.deepEqual(saved?.target, { value: 50, period: "2027", note: "ตกลงในที่ประชุม" });
    assert.equal(saved?.name, "ชื่อใหม่");
  });

  it("keeps ticked steps and task links when the same step is re-imported", async () => {
    await runImport([row()]);
    const id = stepId("ทำขั้นหนึ่ง");
    await setStepDone(store, "X1-01", id, true, "name", NOW);
    await runImport([row()]);
    const step = (await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01"))?.nextSteps.find((s) => s.id === id);
    assert.equal(step?.done, true);
    assert.equal(step?.doneBy, "name");
  });
});

describe("KPI edits", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(async () => {
    store = memoryStore();
    const parsed = parseKpiImport(JSON.stringify([row()]), TODAY);
    assert.ok(parsed.ok);
    await importKpis(store, parsed.value.rows, [], "champ", NOW);
  });

  it("validateKpiPatch refuses target and unknown fields", () => {
    const withTarget = validateKpiPatch({ status: "วัดได้แล้ว", target: { value: 1 } });
    assert.equal(withTarget.ok, false);
    if (!withTarget.ok) assert.match(withTarget.error, /ข้อเสนอ/);
    assert.equal(validateKpiPatch({ name: "x" }).ok, false);
    assert.equal(validateKpiPatch({}).ok, false);
  });

  it("requires a reason, sets source manual and logs the change", async () => {
    assert.equal((await updateKpi(store, { code: "X1-01", patch: { status: "วัดได้แล้ว" }, reason: " ", by: "muk" })).ok, false);
    const res = await updateKpi(store, { code: "X1-01", patch: { status: "วัดได้แล้ว", baseline: null }, reason: "ตรวจซ้ำ", by: "muk", now: NOW });
    assert.ok(res.ok);
    assert.equal(res.value.source, "manual");
    assert.equal(res.value.updatedBy, "muk");
    assert.equal(res.value.baseline, null);
    const log = (await store.listAll<MpChangelog>("mp_changelog")).find((l) => l.summary.includes("แก้ตัวชี้วัด X1-01"));
    assert.ok(log?.summary.includes("ตรวจซ้ำ"));
  });

  it("an edit cannot change an existing target", async () => {
    await store.updateOne<MpKpi>(KPI_COLLECTION, "X1-01", (cur) => (cur ? { data: { ...cur, target: { value: 5, period: "p", note: "" } }, result: cur } : null));
    const res = await updateKpi(store, { code: "X1-01", patch: { target: null }, reason: "ลอง", by: "champ" });
    assert.equal(res.ok, false);
    assert.deepEqual((await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01"))?.target, { value: 5, period: "p", note: "" });
  });

  it("tick / untick a step records who and when", async () => {
    const id = stepId("ทำขั้นสอง");
    const on = await setStepDone(store, "X1-01", id, true, "top", NOW);
    assert.ok(on.ok);
    assert.equal(on.value.doneBy, "top");
    assert.equal(on.value.doneAt, NOW.toISOString());
    const off = await setStepDone(store, "X1-01", id, false, "top", NOW);
    assert.ok(off.ok);
    assert.equal(off.value.doneBy, undefined);
    assert.equal((await setStepDone(store, "X1-01", "nope", true, "top")).ok, false);
  });

  it("สร้างเป็นงาน is idempotent per step", async () => {
    const id = stepId("ทำขั้นหนึ่ง");
    const keys = ["champ", "top", "name", "muk"];
    const first = await createTaskFromStep(store, "X1-01", id, "champ", keys, NOW);
    const second = await createTaskFromStep(store, "X1-01", id, "name", keys, NOW);
    assert.ok(first.ok && second.ok);
    assert.equal(first.value.created, true);
    assert.equal(second.value.created, false);
    assert.equal(second.value.taskCode, first.value.taskCode);
    const tasks = await store.listAll<MpTask>("mp_tasks");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, "X1-01");
    assert.equal(tasks[0].owner, "top");
    assert.deepEqual(tasks[0].missions, ["A"]);
    const step = (await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01"))?.nextSteps.find((s) => s.id === id);
    assert.equal(step?.taskCode, first.value.taskCode);
    // a different step gets its own task
    const other = await createTaskFromStep(store, "X1-01", stepId("ทำขั้นสอง"), "champ", keys, NOW);
    assert.ok(other.ok);
    assert.notEqual(other.value.taskCode, first.value.taskCode);
    assert.equal((await store.listAll<MpTask>("mp_tasks")).length, 2);
  });
});

describe("KPI view helpers", () => {
  const kpis = [
    { code: "B1-02", mission: "B", dimension: "d2", status: "ยังวัดไม่ได้" },
    { code: "A1-10", mission: "A", dimension: "d1", status: "วัดได้แล้ว" },
    { code: "A1-2", mission: "A", dimension: "d1", status: "วัดได้บางส่วน" }
  ] as MpKpi[];

  it("groups mission → dimension in natural code order", () => {
    const groups = groupKpis(kpis);
    assert.deepEqual(
      groups.map((g) => g.mission),
      ["A", "B"]
    );
    assert.deepEqual(
      groups[0].dimensions[0].items.map((k) => k.code),
      ["A1-2", "A1-10"]
    );
  });

  it("counts per mission", () => {
    const a = countsByMission(kpis).find((c) => c.mission === "A");
    assert.equal(a?.counts.total, 2);
    assert.equal(a?.counts["วัดได้แล้ว"], 1);
    assert.equal(countsByMission(kpis).find((c) => c.mission === "D")?.counts.total, 0);
  });

  it("open steps grouped by who, unassigned last, done ones hidden", () => {
    const list = [
      { code: "K1", name: "n", mission: "A", nextSteps: [{ id: "a", action: "a", who: "", effort: "S" }, { id: "b", action: "b", who: "เนม", effort: "M", done: true }] },
      { code: "K2", name: "n", mission: "B", nextSteps: [{ id: "c", action: "c", who: "เนม", effort: "M" }] }
    ] as unknown as MpKpi[];
    const groups = openStepsByWho(list);
    assert.deepEqual(
      groups.map((g) => [g.who, g.steps.length]),
      [
        ["เนม", 1],
        ["ยังไม่ระบุ", 1]
      ]
    );
  });

  it("ownerFromWho only maps a single named member", () => {
    const keys = ["champ", "top", "name", "muk"];
    assert.equal(ownerFromWho("ท้อป", keys), "top");
    assert.equal(ownerFromWho("แชมป์ + มุก", keys), null);
    assert.equal(ownerFromWho("ฝ่ายบัญชี", keys), null);
  });

  it("sparkline points stay inside the box", () => {
    const pts = sparklinePoints([3, 1, 2], 100, 40);
    assert.equal(pts.length, 3);
    assert.ok(pts.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 40));
    assert.ok(pts[0].y < pts[1].y); // higher value → higher on screen (smaller y)
  });
});

describe("KPI MCP tools", () => {
  let store: ReturnType<typeof memoryStore>;
  let ctx: McpContext;
  const call = (name: string, args: Record<string, unknown> = {}, c: McpContext = ctx) =>
    handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, c);
  const textOf = (res: Awaited<ReturnType<typeof call>>) => (res?.result as { content: { text: string }[] }).content[0].text;
  const isErr = (res: Awaited<ReturnType<typeof call>>) => Boolean((res?.result as { isError?: boolean }).isError);

  beforeEach(async () => {
    store = memoryStore();
    // a non-editor member: KPI status tools are open to every token member
    ctx = { member: memberByKey("muk")!, tokenLabel: "AI ของมุก", store, now: () => NOW };
    const parsed = parseKpiImport(JSON.stringify([row(), row({ code: "X2-01", mission: "C", status: "ยังวัดไม่ได้", tier: "เจาะ" })]), TODAY);
    assert.ok(parsed.ok);
    await importKpis(store, parsed.value.rows, [], "champ", NOW);
  });

  it("KPI tools are listed for every member; editor-only tools stay hidden", () => {
    const names = toolList(memberByKey("muk")!).map((t) => t.name);
    for (const name of ["list_kpis", "get_kpi", "update_kpi_status"]) assert.ok(names.includes(name));
    assert.ok(!names.includes("edit_reference_section"));
    const tool = toolList(memberByKey("muk")!).find((t) => t.name === "update_kpi_status");
    assert.ok(!("target" in ((tool?.inputSchema as { properties: Record<string, unknown> }).properties)));
  });

  it("list_kpis filters by mission/status/tier", async () => {
    const all = JSON.parse(textOf(await call("list_kpis")));
    assert.equal(all.length, 2);
    const c = JSON.parse(textOf(await call("list_kpis", { mission: "C" })));
    assert.deepEqual(
      c.map((k: { code: string }) => k.code),
      ["X2-01"]
    );
    assert.match(textOf(await call("list_kpis", { tier: "ภายนอก" })), /none/);
    const bad = await call("list_kpis", { status: "ดีมาก" });
    assert.ok(bad?.error);
  });

  it("get_kpi returns the full record (case-insensitive code)", async () => {
    const kpi = JSON.parse(textOf(await call("get_kpi", { code: "x1-01" })));
    assert.equal(kpi.code, "X1-01");
    assert.ok(isErr(await call("get_kpi", { code: "NOPE" })));
  });

  it("update_kpi_status writes as the token member with source ai-token + changelog", async () => {
    const res = await call("update_kpi_status", { code: "X2-01", status: "วัดได้บางส่วน", gaps: ["ใหม่"], reason: "AI ตรวจแล้ว" });
    assert.ok(!isErr(res), textOf(res));
    const saved = await store.getOne<MpKpi>(KPI_COLLECTION, "X2-01");
    assert.equal(saved?.status, "วัดได้บางส่วน");
    assert.equal(saved?.source, "ai-token");
    assert.equal(saved?.updatedBy, "muk");
    assert.equal(saved?.viaLabel, "AI ของมุก");
    const log = (await store.listAll<MpChangelog>("mp_changelog")).find((l) => l.via === "ai-token");
    assert.ok(log?.summary.includes("AI ตรวจแล้ว"));
  });

  it("update_kpi_status can never write a target", async () => {
    await store.updateOne<MpKpi>(KPI_COLLECTION, "X1-01", (cur) => (cur ? { data: { ...cur, target: { value: 1, period: "p", note: "" } }, result: cur } : null));
    const res = await call("update_kpi_status", { code: "X1-01", target: { value: 999, period: "x", note: "" }, reason: "ลอง" });
    assert.ok(isErr(res));
    const other = await call("update_kpi_status", { code: "X1-01", name: "เปลี่ยนชื่อ", reason: "ลอง" });
    assert.ok(isErr(other));
    const noReason = await call("update_kpi_status", { code: "X1-01", status: "วัดได้แล้ว" });
    assert.ok(noReason?.error);
    assert.deepEqual((await store.getOne<MpKpi>(KPI_COLLECTION, "X1-01"))?.target, { value: 1, period: "p", note: "" });
  });

  it("get_overview includes KPI counts", async () => {
    const overview = JSON.parse(textOf(await call("get_overview")));
    assert.equal(overview.kpis.total, 2);
    assert.equal(overview.kpis["ยังวัดไม่ได้"], 1);
    assert.equal(overview.kpis.openNextSteps, 4);
    assert.equal(overview.kpis.byMission.find((m: { mission: string }) => m.mission === "C").total, 1);
  });
});
