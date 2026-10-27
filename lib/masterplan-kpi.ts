// ตัวชี้วัด (KPI status layer) for the Masterplan workspace — mp_kpis/{code}.
//
// The repo is public: no KPI names, numbers or business text live in git. Every KPI
// arrives through the editors' JSON import (/masterplan/import) and is then kept current by
// members (web edit, with a reason) or their AI tokens (MCP update_kpi_status).
//
// Targets are NEVER set here: import always stores target=null for new KPIs and never
// overwrites an existing non-null target; web edits and AI tokens cannot touch it. A
// target only changes through the proposal process (kind "ตั้งเป้า").
//
// Pure validation/merge logic + store-injected writers (MpStore), unit-tested in
// tests/masterplan-kpi.test.ts with an in-memory store.

import { formatCode, isIsoDate, type MpChangelog, type MpTask, type Result } from "./masterplan.ts";
import type { MpStore } from "./masterplan-tokens.ts";

// ---------------------------------------------------------------- constants

export const KPI_MISSIONS = ["A", "B", "C", "D"] as const;
export type KpiMission = (typeof KPI_MISSIONS)[number];
export const KPI_TIERS = ["หลัก", "เจาะ", "ภายนอก", "นอกดัชนี"] as const;
export type KpiTier = (typeof KPI_TIERS)[number];
export const KPI_DIRECTIONS = ["สูงดี", "ต่ำดี"] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];
export const KPI_STATUSES = ["วัดได้แล้ว", "วัดได้บางส่วน", "ยังวัดไม่ได้"] as const;
export type KpiStatus = (typeof KPI_STATUSES)[number];
export const KPI_CONFIDENCE = ["สูง", "กลาง", "ต่ำ"] as const;
export type KpiConfidence = (typeof KPI_CONFIDENCE)[number];
export const KPI_EFFORTS = ["S", "M", "L"] as const;
export type KpiEffort = (typeof KPI_EFFORTS)[number];

/** Short label for chips / summary columns. */
export const KPI_STATUS_SHORT: Record<KpiStatus, string> = { วัดได้แล้ว: "วัดได้", วัดได้บางส่วน: "บางส่วน", ยังวัดไม่ได้: "ยังไม่ได้" };
/** CSS modifier (reuses the .mp-status palette: green / amber / red). */
export const KPI_STATUS_TONE: Record<KpiStatus, "yes" | "hold" | "no"> = { วัดได้แล้ว: "yes", วัดได้บางส่วน: "hold", ยังวัดไม่ได้: "no" };

export const KPI_COLLECTION = "mp_kpis";
/** Changelog lines for KPI changes carry this slug (version is not a doc version → 0). */
export const KPI_CHANGELOG_SLUG = "kpis";
export const MAX_KPI_IMPORT = 500;

// ---------------------------------------------------------------- types

export type KpiDataSource = { system: string; fields: string; coverage: string };
export type KpiBaseline = { value: number | string; period: string; branch: string; method: string; n?: number };
export type KpiPoint = { period: string; branch: string; value: number };
export type KpiNextStep = {
  /** stable id derived from the action text (keeps done/task links across re-imports) */
  id: string;
  action: string;
  who: string;
  effort: KpiEffort;
  done?: boolean;
  doneBy?: string;
  doneAt?: string;
  /** set once "สร้างเป็นงาน" made an mp_tasks item for this step */
  taskCode?: string;
};
export type KpiTarget = { value: number | string; period: string; note: string };
export type KpiSource = "manual" | "ai-token" | `audit-${string}`;

export type MpKpi = {
  code: string;
  mission: KpiMission;
  dimension: string;
  name: string;
  tier: KpiTier;
  unit: string;
  direction: KpiDirection;
  definition: string;
  status: KpiStatus;
  dataSources: KpiDataSource[];
  baseline: KpiBaseline | null;
  series?: KpiPoint[];
  gaps: string[];
  nextSteps: KpiNextStep[];
  confidence: KpiConfidence;
  target: KpiTarget | null;
  updatedAt: string;
  updatedBy: string;
  source: KpiSource;
  viaLabel?: string;
};

// ---------------------------------------------------------------- small helpers

const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "");
const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const inList = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

export const isKpiStatus = (value: unknown): value is KpiStatus => inList(KPI_STATUSES, value);
export const isKpiMission = (value: unknown): value is KpiMission => inList(KPI_MISSIONS, value);
export const isKpiTier = (value: unknown): value is KpiTier => inList(KPI_TIERS, value);

/** KPI codes are doc ids: letters/digits plus . _ - (never "/"), up to 40 chars. */
export function isKpiCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9ก-๙][A-Za-z0-9ก-๙._-]{0,39}$/.test(value);
}

/** Firestore doc id for a code (codes are already id-safe; dots are fine in Firestore ids). */
export function kpiId(code: string): string {
  return code.trim();
}

/** Deterministic short id for a next step (FNV-1a over the normalised action text). */
export function stepId(action: string): string {
  const text = action.trim().replace(/\s+/g, " ").toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `s${hash.toString(36)}`;
}

function sourceOk(value: string): value is KpiSource {
  return value === "manual" || value === "ai-token" || (/^audit-\d{4}-\d{2}-\d{2}$/.test(value) && isIsoDate(value.slice(6)));
}

// ---------------------------------------------------------------- field validators

type Field<T> = { ok: true; value: T } | { ok: false; error: string };

function validateDataSources(value: unknown): Field<KpiDataSource[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "dataSources ต้องเป็นรายการ" };
  if (value.length > 30) return { ok: false, error: "dataSources มากเกินไป (สูงสุด 30)" };
  const out: KpiDataSource[] = [];
  for (const [i, raw] of value.entries()) {
    const item = obj(raw);
    if (!item) return { ok: false, error: `dataSources ข้อ ${i + 1} ต้องเป็น {system, fields, coverage}` };
    const system = str(item.system).trim();
    if (!system) return { ok: false, error: `dataSources ข้อ ${i + 1} ไม่มี system` };
    const fields = Array.isArray(item.fields) ? item.fields.map(str).filter(Boolean).join(", ") : str(item.fields).trim();
    out.push({ system: system.slice(0, 200), fields: fields.slice(0, 1000), coverage: str(item.coverage).trim().slice(0, 500) });
  }
  return { ok: true, value: out };
}

function validateBaseline(value: unknown): Field<KpiBaseline | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  const item = obj(value);
  if (!item) return { ok: false, error: "baseline ต้องเป็น null หรือ {value, period, branch, method}" };
  const raw = item.value;
  if (!((typeof raw === "number" && Number.isFinite(raw)) || (typeof raw === "string" && raw.trim()))) {
    return { ok: false, error: "baseline.value ต้องเป็นตัวเลขหรือข้อความ" };
  }
  const period = str(item.period).trim();
  if (!period) return { ok: false, error: "baseline ต้องมี period (ช่วงเวลาที่วัด)" };
  const method = str(item.method).trim();
  if (!method) return { ok: false, error: "baseline ต้องมี method (วัดอย่างไร)" };
  const out: KpiBaseline = {
    value: typeof raw === "string" ? raw.trim().slice(0, 200) : raw,
    period: period.slice(0, 100),
    branch: str(item.branch).trim().slice(0, 100),
    method: method.slice(0, 2000)
  };
  if (item.n !== undefined && item.n !== null) {
    if (typeof item.n !== "number" || !Number.isFinite(item.n) || item.n < 0) return { ok: false, error: "baseline.n ต้องเป็นตัวเลขไม่ติดลบ" };
    out.n = item.n;
  }
  return { ok: true, value: out };
}

function validateSeries(value: unknown): Field<KpiPoint[] | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: false, error: "series ต้องเป็นรายการ" };
  if (value.length > 400) return { ok: false, error: "series ยาวเกินไป (สูงสุด 400 จุด)" };
  const out: KpiPoint[] = [];
  for (const [i, raw] of value.entries()) {
    const item = obj(raw);
    const period = str(item?.period).trim();
    const num = item ? (typeof item.value === "number" ? item.value : typeof item.value === "string" && item.value.trim() ? Number(item.value) : NaN) : NaN;
    if (!item || !period || !Number.isFinite(num)) return { ok: false, error: `series จุดที่ ${i + 1} ต้องมี period และ value เป็นตัวเลข` };
    out.push({ period: period.slice(0, 60), branch: str(item.branch).trim().slice(0, 100), value: num });
  }
  return { ok: true, value: out };
}

function validateGaps(value: unknown): Field<string[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "gaps ต้องเป็นรายการข้อความ" };
  if (value.length > 50) return { ok: false, error: "gaps มากเกินไป (สูงสุด 50)" };
  return { ok: true, value: value.map((g) => str(g).trim()).filter(Boolean).map((g) => g.slice(0, 1000)) };
}

/** `previous` keeps done/doneBy/doneAt/taskCode for steps whose action text is unchanged. */
function validateNextSteps(value: unknown, previous: readonly KpiNextStep[] = []): Field<KpiNextStep[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "nextSteps ต้องเป็นรายการ" };
  if (value.length > 50) return { ok: false, error: "nextSteps มากเกินไป (สูงสุด 50)" };
  const out: KpiNextStep[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of value.entries()) {
    const item = obj(raw);
    const action = str(item?.action).trim();
    if (!item || !action) return { ok: false, error: `nextSteps ข้อ ${i + 1} ไม่มี action` };
    const effort = str(item.effort).trim().toUpperCase() || "M";
    if (!inList(KPI_EFFORTS, effort)) return { ok: false, error: `nextSteps ข้อ ${i + 1}: effort ต้องเป็น S, M หรือ L` };
    const id = stepId(action);
    if (seen.has(id)) continue; // same action twice → keep the first
    seen.add(id);
    const prev = previous.find((p) => p.id === id);
    const step: KpiNextStep = { id, action: action.slice(0, 500), who: str(item.who).trim().slice(0, 80), effort };
    const done = typeof item.done === "boolean" ? item.done : Boolean(prev?.done);
    if (done) {
      step.done = true;
      if (prev?.done) {
        if (prev.doneBy) step.doneBy = prev.doneBy;
        if (prev.doneAt) step.doneAt = prev.doneAt;
      }
    }
    if (prev?.taskCode) step.taskCode = prev.taskCode;
    out.push(step);
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------- import

export type KpiImportRow = Omit<MpKpi, "target" | "updatedAt" | "updatedBy" | "viaLabel">;
export type KpiRowError = { row: number; code: string; error: string };

/** Validate one imported object. `today` (YYYY-MM-DD) gives the default source audit-<today>. */
export function validateKpiRow(input: unknown, today: string): Result<KpiImportRow> {
  const item = obj(input);
  if (!item) return { ok: false, error: "แถวนี้ไม่ใช่ object" };
  const code = str(item.code).trim();
  if (!code) return { ok: false, error: "ไม่มี code" };
  if (!isKpiCode(code)) return { ok: false, error: `code "${str(item.code).trim().slice(0, 40)}" ใช้ได้เฉพาะตัวอักษร ตัวเลข . _ - และยาวไม่เกิน 40 ตัว` };
  const mission = str(item.mission).trim().toUpperCase().replace(/^MISSION\s*/, "");
  if (!isKpiMission(mission)) return { ok: false, error: "mission ต้องเป็น A, B, C หรือ D" };
  const dimension = str(item.dimension).trim();
  if (!dimension) return { ok: false, error: "ไม่มี dimension (มิติ)" };
  const name = str(item.name).trim();
  if (!name) return { ok: false, error: "ไม่มี name (ชื่อตัวชี้วัด)" };
  if (name.length > 300) return { ok: false, error: "name ยาวเกินไป (สูงสุด 300 ตัวอักษร)" };
  const tier = str(item.tier).trim();
  if (!isKpiTier(tier)) return { ok: false, error: `tier ต้องเป็น ${KPI_TIERS.join(" / ")}` };
  const direction = str(item.direction).trim();
  if (!inList(KPI_DIRECTIONS, direction)) return { ok: false, error: "direction ต้องเป็น สูงดี หรือ ต่ำดี" };
  const status = str(item.status).trim();
  if (!isKpiStatus(status)) return { ok: false, error: `status ต้องเป็น ${KPI_STATUSES.join(" / ")}` };
  const confidence = str(item.confidence).trim() || "กลาง";
  if (!inList(KPI_CONFIDENCE, confidence)) return { ok: false, error: "confidence ต้องเป็น สูง / กลาง / ต่ำ" };
  const sourceRaw = str(item.source).trim() || `audit-${today}`;
  if (!sourceOk(sourceRaw)) return { ok: false, error: "source ต้องเป็น audit-YYYY-MM-DD, manual หรือ ai-token" };

  const dataSources = validateDataSources(item.dataSources);
  if (!dataSources.ok) return dataSources;
  const baseline = validateBaseline(item.baseline);
  if (!baseline.ok) return baseline;
  const series = validateSeries(item.series);
  if (!series.ok) return series;
  const gaps = validateGaps(item.gaps);
  if (!gaps.ok) return gaps;
  const nextSteps = validateNextSteps(item.nextSteps);
  if (!nextSteps.ok) return nextSteps;

  const row: KpiImportRow = {
    code,
    mission,
    dimension: dimension.slice(0, 200),
    name,
    tier,
    unit: str(item.unit).trim().slice(0, 60),
    direction,
    definition: str(item.definition).trim().slice(0, 4000),
    status,
    dataSources: dataSources.value,
    baseline: baseline.value,
    gaps: gaps.value,
    nextSteps: nextSteps.value,
    confidence,
    source: sourceRaw
  };
  if (series.value) row.series = series.value;
  return { ok: true, value: row };
}

/** Lenient parse of the pasted JSON (array, or {kpis:[…]}), validating every row. */
export function parseKpiImport(text: string, today: string): Result<{ rows: KpiImportRow[]; errors: KpiRowError[] }> {
  let data: unknown;
  try {
    data = JSON.parse((text || "").replace(/^﻿/, "").replace(/[“”]/g, '"').replace(/,\s*([\]}])/g, "$1"));
  } catch {
    return { ok: false, error: "อ่าน JSON ไม่ได้ — ตรวจวงเล็บ/เครื่องหมายคำพูด แล้ววางใหม่" };
  }
  const wrapped = obj(data);
  if (wrapped && Array.isArray(wrapped.kpis)) data = wrapped.kpis;
  if (!Array.isArray(data)) return { ok: false, error: "ต้องเป็น JSON array ของตัวชี้วัด เช่น [{\"code\":\"…\",\"mission\":\"A\",…}]" };
  if (data.length === 0) return { ok: false, error: "ไม่มีตัวชี้วัดในไฟล์" };
  if (data.length > MAX_KPI_IMPORT) return { ok: false, error: `นำเข้าได้ครั้งละไม่เกิน ${MAX_KPI_IMPORT} รายการ` };
  const rows: KpiImportRow[] = [];
  const errors: KpiRowError[] = [];
  const seen = new Set<string>();
  data.forEach((raw, i) => {
    const code = str(obj(raw)?.code).trim();
    const checked = validateKpiRow(raw, today);
    if (!checked.ok) {
      errors.push({ row: i + 1, code, error: checked.error });
      return;
    }
    if (seen.has(checked.value.code)) {
      errors.push({ row: i + 1, code, error: `code ${code} ซ้ำในไฟล์ (ใช้แถวแรก)` });
      return;
    }
    seen.add(checked.value.code);
    rows.push(checked.value);
  });
  return { ok: true, value: { rows, errors } };
}

/**
 * Upsert merge for one imported row. Never overwrites an existing non-null target; new KPIs
 * always start with target=null. Done-state / task links of unchanged next steps survive.
 */
export function mergeImportedKpi(existing: MpKpi | null, row: KpiImportRow, by: string, now: string): MpKpi {
  const nextSteps = existing ? (validateNextSteps(row.nextSteps, existing.nextSteps) as { ok: true; value: KpiNextStep[] }).value : row.nextSteps;
  const merged: MpKpi = {
    ...row,
    nextSteps,
    target: existing?.target ?? null,
    updatedAt: now,
    updatedBy: by
  };
  if (!row.series) delete merged.series;
  return merged;
}

export type KpiImportReport = { created: string[]; updated: string[]; skipped: KpiRowError[] };

export async function importKpis(store: MpStore, rows: readonly KpiImportRow[], errors: readonly KpiRowError[], by: string, now: Date = new Date()): Promise<KpiImportReport> {
  const at = now.toISOString();
  const report: KpiImportReport = { created: [], updated: [], skipped: [...errors] };
  for (const row of rows) {
    const outcome = await store.updateOne<MpKpi, "created" | "updated">(KPI_COLLECTION, kpiId(row.code), (current) => ({
      data: mergeImportedKpi(current, row, by, at),
      result: current ? "updated" : "created"
    }));
    if (outcome === "created") report.created.push(row.code);
    else if (outcome === "updated") report.updated.push(row.code);
  }
  const total = report.created.length + report.updated.length;
  if (total > 0) {
    await addKpiChangelog(store, {
      at,
      by,
      summary: `นำเข้าสถานะตัวชี้วัด ${total} รายการ (ใหม่ ${report.created.length} · อัปเดต ${report.updated.length}${report.skipped.length ? ` · ข้าม ${report.skipped.length}` : ""})`
    });
  }
  return report;
}

// ---------------------------------------------------------------- edits (web + AI token)

/** Fields a member (or their AI token) may change. `target` is deliberately absent. */
export const KPI_EDITABLE = ["status", "gaps", "nextSteps", "dataSources", "baseline"] as const;
export type KpiPatch = Partial<Pick<MpKpi, (typeof KPI_EDITABLE)[number]>>;

/**
 * Validate a patch. Unknown keys are refused (so "target" can never slip in), and at least
 * one editable field must be present. `previous` keeps step done-state across the edit.
 */
export function validateKpiPatch(input: unknown, previous: readonly KpiNextStep[] = []): Result<KpiPatch> {
  const item = obj(input);
  if (!item) return { ok: false, error: "ไม่มีข้อมูลที่จะแก้" };
  if ("target" in item) return { ok: false, error: "เป้าหมายตั้งผ่านข้อเสนอ (ตั้งเป้า) เท่านั้น — แก้ตรงนี้ไม่ได้" };
  const unknown = Object.keys(item).filter((key) => !(KPI_EDITABLE as readonly string[]).includes(key));
  if (unknown.length) return { ok: false, error: `แก้ช่องนี้ไม่ได้: ${unknown.join(", ")}` };
  const patch: KpiPatch = {};
  if (item.status !== undefined) {
    if (!isKpiStatus(item.status)) return { ok: false, error: `status ต้องเป็น ${KPI_STATUSES.join(" / ")}` };
    patch.status = item.status;
  }
  if (item.gaps !== undefined) {
    const gaps = validateGaps(item.gaps);
    if (!gaps.ok) return gaps;
    patch.gaps = gaps.value;
  }
  if (item.nextSteps !== undefined) {
    const steps = validateNextSteps(item.nextSteps, previous);
    if (!steps.ok) return steps;
    patch.nextSteps = steps.value;
  }
  if (item.dataSources !== undefined) {
    const sources = validateDataSources(item.dataSources);
    if (!sources.ok) return sources;
    patch.dataSources = sources.value;
  }
  if (item.baseline !== undefined) {
    const baseline = validateBaseline(item.baseline);
    if (!baseline.ok) return baseline;
    patch.baseline = baseline.value;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "ไม่มีช่องที่จะแก้" };
  return { ok: true, value: patch };
}

export type KpiEditInput = { code: string; patch: unknown; reason: string; by: string; via?: { label: string }; now?: Date };

export async function updateKpi(store: MpStore, input: KpiEditInput): Promise<Result<MpKpi>> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "ต้องใส่เหตุผลที่แก้" };
  if (reason.length > 2000) return { ok: false, error: "เหตุผลยาวเกินไป" };
  if (!isKpiCode(input.code)) return { ok: false, error: "ไม่พบตัวชี้วัดนี้" };
  const at = (input.now ?? new Date()).toISOString();
  const state: { error: string | null; fields: string[] } = { error: null, fields: [] };
  const saved = await store.updateOne<MpKpi>(KPI_COLLECTION, kpiId(input.code), (current) => {
    if (!current) {
      state.error = "ไม่พบตัวชี้วัดนี้";
      return null;
    }
    const checked = validateKpiPatch(input.patch, current.nextSteps);
    if (!checked.ok) {
      state.error = checked.error;
      return null;
    }
    state.fields = Object.keys(checked.value);
    // target is copied from `current` untouched — a patch can never carry it (validateKpiPatch)
    const next: MpKpi = { ...current, ...checked.value, target: current.target ?? null, updatedAt: at, updatedBy: input.by, source: input.via ? "ai-token" : "manual" };
    if (input.via) next.viaLabel = input.via.label;
    else delete next.viaLabel;
    return { data: next, result: next };
  });
  if (!saved) return { ok: false, error: state.error ?? "บันทึกไม่สำเร็จ" };
  await addKpiChangelog(store, {
    at,
    by: input.by,
    summary: `แก้ตัวชี้วัด ${saved.code} (${state.fields.map(fieldLabel).join(", ")}) — ${reason}${input.via ? ` (ผ่าน AI: ${input.via.label})` : ""}`,
    via: input.via
  });
  return { ok: true, value: saved };
}

const FIELD_LABELS: Record<string, string> = { status: "สถานะ", gaps: "ช่องว่าง", nextSteps: "สิ่งที่ต้องทำต่อ", dataSources: "แหล่งข้อมูล", baseline: "ค่าฐาน" };
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;

/** Tick / untick one next step (any member). Records who and when. */
export async function setStepDone(store: MpStore, code: string, id: string, done: boolean, by: string, now: Date = new Date()): Promise<Result<KpiNextStep>> {
  if (!isKpiCode(code)) return { ok: false, error: "ไม่พบตัวชี้วัดนี้" };
  const at = now.toISOString();
  const result = await store.updateOne<MpKpi, KpiNextStep>(KPI_COLLECTION, kpiId(code), (current) => {
    const step = current?.nextSteps.find((s) => s.id === id);
    if (!current || !step) return null;
    const updated: KpiNextStep = { ...step, done };
    if (done) {
      updated.doneBy = by;
      updated.doneAt = at;
    } else {
      delete updated.doneBy;
      delete updated.doneAt;
    }
    return { data: { ...current, nextSteps: current.nextSteps.map((s) => (s.id === id ? updated : s)) }, result: updated };
  });
  return result ? { ok: true, value: result } : { ok: false, error: "ไม่พบขั้นตอนนี้แล้ว — โหลดหน้าใหม่" };
}

/** mp_tasks doc id for a KPI step — deterministic, so a second click finds the same task. */
export function stepTaskId(code: string, id: string): string {
  return `kpi-${code.replace(/[^A-Za-z0-9ก-๙_-]/g, "-")}-${id}`.slice(0, 150);
}

/**
 * "สร้างเป็นงาน": make an mp_tasks item for one next step (source = KPI code). Idempotent per
 * step — the task id is derived from code+step, and an existing task is returned as-is.
 */
export async function createTaskFromStep(
  store: MpStore,
  code: string,
  id: string,
  by: string,
  ownerKeys: readonly string[],
  now: Date = new Date()
): Promise<Result<{ taskCode: string; created: boolean }>> {
  if (!isKpiCode(code)) return { ok: false, error: "ไม่พบตัวชี้วัดนี้" };
  const kpi = await store.getOne<MpKpi>(KPI_COLLECTION, kpiId(code));
  const step = kpi?.nextSteps.find((s) => s.id === id);
  if (!kpi || !step) return { ok: false, error: "ไม่พบขั้นตอนนี้แล้ว — โหลดหน้าใหม่" };
  const taskId = stepTaskId(kpi.code, step.id);
  const existing = await store.getOne<MpTask>("mp_tasks", taskId);
  let taskCode = existing?.code ?? "";
  let created = false;
  if (!existing) {
    const candidate = formatCode("T", await store.nextSequence("task"));
    const at = now.toISOString();
    const owner = ownerFromWho(step.who, ownerKeys);
    taskCode =
      (await store.updateOne<MpTask, string>("mp_tasks", taskId, (current) => {
        if (current) return { data: current, result: current.code };
        created = true;
        const task: MpTask = {
          id: taskId,
          code: candidate,
          title: step.action.slice(0, 200),
          detail: `จากตัวชี้วัด ${kpi.code}${step.who ? ` · ผู้รับผิดชอบ: ${step.who}` : ""} · ขนาดงาน ${step.effort}`,
          missions: [kpi.mission],
          owner,
          due: null,
          status: "ยังไม่เริ่ม",
          source: kpi.code,
          createdBy: by,
          createdAt: at,
          updatedAt: at
        };
        return { data: task, result: candidate };
      })) ?? candidate;
  }
  await store.updateOne<MpKpi, null>(KPI_COLLECTION, kpiId(kpi.code), (current) => {
    if (!current) return null;
    const target = current.nextSteps.find((s) => s.id === id);
    if (!target || target.taskCode === taskCode) return null;
    return { data: { ...current, nextSteps: current.nextSteps.map((s) => (s.id === id ? { ...s, taskCode } : s)) }, result: null };
  });
  return { ok: true, value: { taskCode, created } };
}

const WHO_HINTS: Record<string, string> = { แชมป์: "champ", champ: "champ", ท้อป: "top", top: "top", เนม: "name", name: "name", มุก: "muk", muk: "muk" };

/** A step's free-text "who" → a member key when it names exactly one member, else null. */
export function ownerFromWho(who: string, ownerKeys: readonly string[]): string | null {
  const text = who.trim().toLowerCase();
  if (!text) return null;
  const hits = new Set<string>();
  for (const [needle, key] of Object.entries(WHO_HINTS)) {
    const thai = /[ก-๙]/.test(needle);
    if (thai ? text.includes(needle) : text.split(/[^a-z]+/).includes(needle)) hits.add(key);
  }
  if (hits.size !== 1) return null;
  const key = [...hits][0];
  return ownerKeys.includes(key) ? key : null;
}

async function addKpiChangelog(store: MpStore, entry: { at: string; by: string; summary: string; via?: { label: string } }) {
  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const line: MpChangelog = {
    id,
    at: entry.at,
    by: entry.by,
    version: 0,
    proposalCode: null,
    summary: entry.summary,
    slug: KPI_CHANGELOG_SLUG,
    ...(entry.via ? { via: "ai-token" as const, viaLabel: entry.via.label } : {})
  };
  await store.putOne<MpChangelog>("mp_changelog", id, line);
}

// ---------------------------------------------------------------- views

export type KpiCounts = Record<KpiStatus, number> & { total: number };

export function countByStatus(kpis: readonly Pick<MpKpi, "status">[]): KpiCounts {
  const counts = { total: kpis.length, วัดได้แล้ว: 0, วัดได้บางส่วน: 0, ยังวัดไม่ได้: 0 } as KpiCounts;
  for (const kpi of kpis) if (isKpiStatus(kpi.status)) counts[kpi.status] += 1;
  return counts;
}

export function countsByMission(kpis: readonly Pick<MpKpi, "status" | "mission">[]): { mission: KpiMission; counts: KpiCounts }[] {
  return KPI_MISSIONS.map((mission) => ({ mission, counts: countByStatus(kpis.filter((k) => k.mission === mission)) }));
}

export function sortKpis<T extends Pick<MpKpi, "code">>(kpis: readonly T[]): T[] {
  return [...kpis].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

/** mission → dimension → KPIs (codes in natural order), empty groups dropped. */
export function groupKpis<T extends Pick<MpKpi, "code" | "mission" | "dimension">>(kpis: readonly T[]): { mission: KpiMission; dimensions: { dimension: string; items: T[] }[] }[] {
  const sorted = sortKpis(kpis);
  return KPI_MISSIONS.map((mission) => {
    const inMission = sorted.filter((k) => k.mission === mission);
    const dims: string[] = [];
    for (const k of inMission) if (!dims.includes(k.dimension)) dims.push(k.dimension);
    return { mission, dimensions: dims.map((dimension) => ({ dimension, items: inMission.filter((k) => k.dimension === dimension) })) };
  }).filter((group) => group.dimensions.length > 0);
}

export type OpenStep = { code: string; name: string; mission: KpiMission; step: KpiNextStep };

/** Every not-done next step, grouped by who (unassigned last). */
export function openStepsByWho(kpis: readonly MpKpi[]): { who: string; steps: OpenStep[] }[] {
  const groups = new Map<string, OpenStep[]>();
  for (const kpi of sortKpis(kpis)) {
    for (const step of kpi.nextSteps ?? []) {
      if (step.done) continue;
      const who = step.who.trim() || "ยังไม่ระบุ";
      if (!groups.has(who)) groups.set(who, []);
      (groups.get(who) as OpenStep[]).push({ code: kpi.code, name: kpi.name, mission: kpi.mission, step });
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "ยังไม่ระบุ" ? 1 : b === "ยังไม่ระบุ" ? -1 : a.localeCompare(b, "th")))
    .map(([who, steps]) => ({ who, steps }));
}

export function allWho(kpis: readonly MpKpi[]): string[] {
  const set = new Set<string>();
  for (const kpi of kpis) for (const step of kpi.nextSteps ?? []) if (step.who.trim()) set.add(step.who.trim());
  return [...set].sort((a, b) => a.localeCompare(b, "th"));
}

export function formatKpiValue(value: number | string, unit: string): string {
  const text = typeof value === "number" ? value.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : value;
  return unit ? `${text} ${unit}` : text;
}

/** Points for a tiny inline sparkline (0..width × 0..height, y up = higher value). */
export function sparklinePoints(values: readonly number[], width: number, height: number, pad = 3): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: Math.round((pad + i * step) * 10) / 10,
    y: Math.round((max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2)) * 10) / 10
  }));
}

/** series split per branch ("" = รวม), each in the order given. */
export function seriesByBranch(series: readonly KpiPoint[] | undefined): { branch: string; points: KpiPoint[] }[] {
  const out = new Map<string, KpiPoint[]>();
  for (const point of series ?? []) {
    if (!out.has(point.branch)) out.set(point.branch, []);
    (out.get(point.branch) as KpiPoint[]).push(point);
  }
  return [...out.entries()].map(([branch, points]) => ({ branch, points }));
}

/** Compact view for the MCP tools / AI. */
export function compactKpi(kpi: MpKpi) {
  return {
    code: kpi.code,
    mission: kpi.mission,
    dimension: kpi.dimension,
    name: kpi.name,
    tier: kpi.tier,
    status: kpi.status,
    unit: kpi.unit,
    direction: kpi.direction,
    baseline: kpi.baseline,
    confidence: kpi.confidence,
    openSteps: (kpi.nextSteps ?? []).filter((s) => !s.done).length,
    hasTarget: kpi.target !== null
  };
}
