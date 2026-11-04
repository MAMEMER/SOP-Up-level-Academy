// Pure logic for the Masterplan workspace (no I/O — everything here is unit-tested in
// tests/masterplan.test.ts). Storage lives in masterplan-store.ts, auth in masterplan-auth.ts.
//
// Layers: ฉบับกลาง (mp_docs/master) is only changed through proposals that the daily
// meeting accepts (ลง), or by an editor directly with a reason. Every change bumps the
// version and writes a changelog line. Below it sits the task layer (mp_tasks).

import type { MasterplanMemberKey } from "./masterplan-access.ts";

// ---------------------------------------------------------------- constants

export const MASTER_SLUG = "master";
export const REFERENCE_SLUGS = ["mission-a", "mission-b", "mission-c", "mission-d", "research", "roadmap", "audit-a", "audit-b", "audit-c", "audit-programs"] as const;
export const DOC_SLUGS = [MASTER_SLUG, ...REFERENCE_SLUGS] as const;
export type DocSlug = (typeof DOC_SLUGS)[number];

export const DEFAULT_DOC_TITLES: Record<DocSlug, string> = {
  master: "ฉบับกลาง",
  "mission-a": "Mission A",
  "mission-b": "Mission B",
  "mission-c": "Mission C",
  "mission-d": "Mission D",
  research: "งานวิจัยประกอบ",
  roadmap: "Roadmap",
  // raw data-audit reports per mission — reference only, never the central doc
  "audit-a": "ผลตรวจข้อมูลตัวชี้วัด A",
  "audit-b": "ผลตรวจข้อมูลตัวชี้วัด B (ร่าง)",
  "audit-c": "ผลตรวจข้อมูลตัวชี้วัด C",
  "audit-programs": "ผลตรวจโปรแกรมร้าน โควตา และการรายงาน"
};

export const MISSIONS = ["ภาพรวม", "A", "B", "C", "D"] as const;
export type Mission = (typeof MISSIONS)[number];

export const PROPOSAL_KINDS = ["แก้", "เพิ่ม", "ลบ", "ตั้งเป้า", "คำถาม"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = ["ร่าง", "รอคุย", "ลง", "ไม่ลง", "พักไว้", "ลงแล้ว"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const VERDICTS = ["ลง", "ไม่ลง", "พักไว้"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const TASK_STATUSES = ["ยังไม่เริ่ม", "กำลังทำ", "รอตรวจ", "เสร็จ", "พัก"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Firestore refuses documents over 1 MiB; refuse well before that. */
export const MAX_DOC_BYTES = 900_000;
/** Above this the "copy for AI" block is too big for most chat boxes. */
export const AI_COPY_SOFT_LIMIT = 100_000;

// ---------------------------------------------------------------- types

export type MpDoc = {
  slug: string;
  title: string;
  markdown: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

/** Set on records written through a per-person AI token (MCP connector / read link). */
export type ViaAi = { via?: "ai-token"; viaLabel?: string };

export type MpScratch = { member: string; markdown: string; updatedAt: string } & ViaAi;

export type MpProposal = {
  id: string;
  code: string;
  title: string;
  proposer: string;
  missions: Mission[];
  location: string;
  kind: ProposalKind;
  oldText: string;
  newText: string;
  reason: string;
  status: ProposalStatus;
  decidedOn: string | null;
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
} & ViaAi;

export type MpTask = {
  id: string;
  code: string;
  title: string;
  detail: string;
  missions: Mission[];
  owner: string | null;
  due: string | null;
  status: TaskStatus;
  source: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
} & ViaAi;

export type MpMeetingDecision = { proposalId: string; code: string; verdict: Verdict; note: string };
export type MpMeeting = {
  date: string;
  attendees: string[];
  decisions: MpMeetingDecision[];
  summary: string;
  closedBy: string;
  closedAt: string;
};

export type MpChangelog = {
  id: string;
  at: string;
  by: string;
  version: number;
  proposalCode: string | null;
  summary: string;
  /** which doc changed (absent on older lines = ฉบับกลาง) */
  slug?: string;
} & ViaAi;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------------------------------------------------------------- small helpers

const str = (value: unknown): string => (typeof value === "string" ? value : "");

export function isDocSlug(value: unknown): value is DocSlug {
  return typeof value === "string" && (DOC_SLUGS as readonly string[]).includes(value);
}
export function isMission(value: unknown): value is Mission {
  return typeof value === "string" && (MISSIONS as readonly string[]).includes(value);
}
export function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(value);
}
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}
export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** UTF-8 byte length (what Firestore counts). */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function checkDocSize(markdown: string): Result<number> {
  const bytes = byteLength(markdown);
  if (bytes > MAX_DOC_BYTES) {
    return { ok: false, error: `เอกสารใหญ่เกินไป (${Math.round(bytes / 1024)} KB) — จำกัด ${Math.round(MAX_DOC_BYTES / 1024)} KB ต่อเอกสาร ลองแยกเป็นหลายเอกสาร` };
  }
  return { ok: true, value: bytes };
}

/** YYYY-MM-DD in Asia/Bangkok. */
export function bangkokDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "P-001" — zero-padded to at least 3 digits. */
export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(Math.max(1, Math.floor(n))).padStart(3, "0")}`;
}

/** Highest number already used for this prefix + 1 (ignores codes with another prefix). */
export function nextCodeNumber(existingCodes: readonly string[], prefix: string): number {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** A Firestore-safe doc id from a code ("P-001", "A1-03"). Never contains "/". */
export function idFromCode(code: string): string {
  return code.trim().replace(/[^\p{L}\p{N}_.-]/gu, "-").slice(0, 120);
}

export function normalizeMissions(value: unknown): Mission[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s/]+/) : [];
  const out: Mission[] = [];
  for (const item of raw) {
    const text = str(item).trim();
    if (!text) continue;
    const upper = text.toUpperCase().replace(/^MISSION\s*/, "");
    const mission = isMission(text) ? text : isMission(upper) ? upper : /^(overall|all|รวม|ภาพรวม)$/i.test(text) ? "ภาพรวม" : null;
    if (mission && !out.includes(mission)) out.push(mission);
  }
  return out;
}

// ---------------------------------------------------------------- proposals

export type ProposalDraft = Pick<MpProposal, "title" | "missions" | "location" | "kind" | "oldText" | "newText" | "reason">;

const LIMITS = { title: 200, location: 200, text: 60_000, reason: 4_000, note: 2_000 };

export function validateProposalDraft(input: unknown): Result<ProposalDraft> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = str(body.title).trim();
  const kind = str(body.kind).trim();
  const missions = normalizeMissions(body.missions);
  const location = str(body.location).trim();
  const oldText = str(body.oldText);
  const newText = str(body.newText);
  const reason = str(body.reason).trim();

  if (!title) return { ok: false, error: "ใส่หัวข้อข้อเสนอ" };
  if (title.length > LIMITS.title) return { ok: false, error: "หัวข้อยาวเกินไป" };
  if (!(PROPOSAL_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "เลือกประเภทข้อเสนอ" };
  if (missions.length === 0) return { ok: false, error: "เลือกอย่างน้อย 1 Mission (หรือ ภาพรวม)" };
  if (location.length > LIMITS.location) return { ok: false, error: "ตำแหน่งยาวเกินไป" };
  if (oldText.length > LIMITS.text || newText.length > LIMITS.text) return { ok: false, error: "ข้อความยาวเกินไป" };
  if (reason.length > LIMITS.reason) return { ok: false, error: "เหตุผลยาวเกินไป" };
  if ((kind === "แก้" || kind === "ลบ") && !oldText.trim()) return { ok: false, error: "ข้อเสนอแบบแก้/ลบ ต้องมีข้อความเดิม" };
  if ((kind === "แก้" || kind === "เพิ่ม" || kind === "ตั้งเป้า") && !newText.trim()) return { ok: false, error: "ใส่ข้อความใหม่" };
  return { ok: true, value: { title, kind: kind as ProposalKind, missions, location, oldText, newText, reason } };
}

export type ProposalActor = { key: string; editor: boolean };

/**
 * Who may move a proposal from → to.
 *  - proposer: ร่าง↔รอคุย, พักไว้→รอคุย (bring it back to the agenda)
 *  - any member (the meeting decides together): รอคุย→ลง/ไม่ลง/พักไว้, and undo that back to รอคุย
 *  - editors only: ลง→ลงแล้ว (through the apply flow)
 */
export function canTransition(proposal: Pick<MpProposal, "status" | "proposer">, to: ProposalStatus, actor: ProposalActor): boolean {
  const from = proposal.status;
  const isOwner = proposal.proposer === actor.key;
  if (from === to) return false;
  if (from === "ร่าง" && to === "รอคุย") return isOwner;
  if (from === "รอคุย" && to === "ร่าง") return isOwner;
  if (from === "พักไว้" && to === "รอคุย") return true;
  if (from === "รอคุย" && isVerdict(to)) return true;
  if ((from === "ลง" || from === "ไม่ลง") && to === "รอคุย") return true;
  if (from === "ลง" && to === "ลงแล้ว") return actor.editor;
  return false;
}

/** The owner may edit the content of their own ร่าง / รอคุย proposal. */
export function canEditProposal(proposal: Pick<MpProposal, "status" | "proposer">, actor: ProposalActor): boolean {
  return proposal.proposer === actor.key && (proposal.status === "ร่าง" || proposal.status === "รอคุย");
}

export function canDeleteProposal(proposal: Pick<MpProposal, "status" | "proposer">, actor: ProposalActor): boolean {
  return proposal.proposer === actor.key && proposal.status === "ร่าง";
}

/** Primary mission for grouping (first listed, else ภาพรวม). */
export function primaryMission(missions: readonly Mission[]): Mission {
  return missions[0] ?? "ภาพรวม";
}

export function groupByMission<T extends { missions: Mission[] }>(items: readonly T[]): { mission: Mission; items: T[] }[] {
  return MISSIONS.map((mission) => ({ mission, items: items.filter((item) => primaryMission(item.missions) === mission) })).filter(
    (group) => group.items.length > 0
  );
}

// ---------------------------------------------------------------- markdown sections

export type MdSection = {
  /** 0 = text before the first heading (heading is ""). */
  index: number;
  level: number;
  heading: string;
  /** offset of the heading line (or 0 for the preamble) */
  start: number;
  /** offset where the body starts (just after the heading line) */
  bodyStart: number;
  /** offset where the next heading starts (or end of doc) */
  end: number;
  body: string;
};

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;

/**
 * Split markdown at every ATX heading (outside fenced code). Section 0 is the preamble
 * (may be empty). Each section's body is the exact source text between its heading line
 * and the next heading — so body is always an exact substring of the document.
 */
export function splitSections(markdown: string): MdSection[] {
  const sections: MdSection[] = [];
  let inFence = false;
  let fenceMarker = "";
  let offset = 0;
  const heads: { level: number; heading: string; start: number; bodyStart: number }[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, "");
    const lineEnd = offset + raw.length + (i < lines.length - 1 ? 1 : 0);
    const fence = /^\s{0,3}(```|~~~)/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
      }
    } else if (!inFence) {
      const match = HEADING_RE.exec(line);
      if (match) heads.push({ level: match[1].length, heading: match[2].trim(), start: offset, bodyStart: lineEnd });
    }
    offset = lineEnd;
  }
  const firstStart = heads[0]?.start ?? markdown.length;
  sections.push({ index: 0, level: 0, heading: "", start: 0, bodyStart: 0, end: firstStart, body: markdown.slice(0, firstStart) });
  heads.forEach((head, i) => {
    const end = heads[i + 1]?.start ?? markdown.length;
    sections.push({
      index: i + 1,
      level: head.level,
      heading: head.heading,
      start: head.start,
      bodyStart: head.bodyStart,
      end,
      body: markdown.slice(head.bodyStart, end)
    });
  });
  return sections;
}

/**
 * A section plus its sub-sections (everything until the next heading of the same or higher
 * level) — what "this section" means to a reader.
 */
export function sectionWithChildren(markdown: string, index: number): string {
  const sections = splitSections(markdown);
  const section = sections[index];
  if (!section) return "";
  if (index === 0) return section.body;
  let end = markdown.length;
  for (const next of sections.slice(index + 1)) {
    if (next.level <= section.level) {
      end = next.start;
      break;
    }
  }
  return markdown.slice(section.start, end);
}

/** Replace one section's body. The caller must pass the body it based the edit on. */
export function replaceSectionBody(markdown: string, index: number, baseBody: string, newBody: string): Result<string> {
  const section = splitSections(markdown)[index];
  if (!section) return { ok: false, error: "ไม่พบหัวข้อนี้ในฉบับกลางแล้ว" };
  if (section.body !== baseBody) return { ok: false, error: "หัวข้อนี้ถูกแก้ไปแล้วระหว่างนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
  let body = newBody;
  // keep the blank line that separates this section from the next heading
  if (section.end < markdown.length && body && !body.endsWith("\n")) body += "\n";
  if (section.end < markdown.length && body && !body.endsWith("\n\n") && section.body.endsWith("\n\n")) body += "\n";
  return { ok: true, value: markdown.slice(0, section.bodyStart) + body + markdown.slice(section.end) };
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** Replace oldText with newText only when oldText occurs exactly once. */
export function applyExactReplace(markdown: string, oldText: string, newText: string): Result<string> {
  const count = countOccurrences(markdown, oldText);
  if (count === 0) return { ok: false, error: "ไม่พบข้อความเดิมในฉบับกลาง" };
  if (count > 1) return { ok: false, error: `ข้อความเดิมพบ ${count} ที่ — ต้องแก้ด้วยมือ` };
  const at = markdown.indexOf(oldText);
  return { ok: true, value: markdown.slice(0, at) + newText + markdown.slice(at + oldText.length) };
}

/** Best guess of which section a proposal targets: exact heading match on location, else where oldText sits. */
export function findSectionIndex(markdown: string, location: string, oldText: string): number {
  const sections = splitSections(markdown);
  const wanted = location.trim().replace(/^#+\s*/, "");
  if (wanted) {
    const exact = sections.find((s) => s.index > 0 && s.heading === wanted);
    if (exact) return exact.index;
    const partial = sections.find((s) => s.index > 0 && (s.heading.includes(wanted) || wanted.includes(s.heading)));
    if (partial) return partial.index;
  }
  if (oldText.trim()) {
    const at = markdown.indexOf(oldText.trim());
    if (at >= 0) {
      const hit = [...sections].reverse().find((s) => s.start <= at);
      if (hit) return hit.index;
    }
  }
  return sections.length > 1 ? 1 : 0;
}

/** Text around a match, for the apply preview. */
export function contextAround(markdown: string, needle: string, radius = 160): { before: string; after: string } | null {
  const at = markdown.indexOf(needle);
  if (at < 0 || !needle) return null;
  const beforeStart = Math.max(0, at - radius);
  const afterEnd = Math.min(markdown.length, at + needle.length + radius);
  return {
    before: (beforeStart > 0 ? "…" : "") + markdown.slice(beforeStart, at),
    after: markdown.slice(at + needle.length, afterEnd) + (afterEnd < markdown.length ? "…" : "")
  };
}

// ---------------------------------------------------------------- AI copy / paste

export type AiContextInput = {
  memberName: string;
  scopeLabel: string;
  docTitle?: string;
  docText?: string;
  scratch?: string;
  openProposals?: Pick<MpProposal, "code" | "title" | "status" | "location" | "kind" | "newText">[];
};

export const AI_REPLY_EXAMPLE = `[
  {
    "title": "หัวข้อสั้นๆ ของข้อเสนอ",
    "missions": ["A"],
    "location": "ชื่อหัวข้อในเอกสาร หรือรหัส KPI",
    "kind": "แก้",
    "oldText": "ข้อความเดิมที่ต้องการแก้ (คัดลอกมาตรงตัว)",
    "newText": "ข้อความใหม่ที่เสนอ",
    "reason": "เหตุผลสั้นๆ"
  }
]`;

/** The single block of text the user pastes into Claude / ChatGPT / Gemini / Grok. */
export function buildAiContext(input: AiContextInput): string {
  const parts: string[] = [];
  parts.push(
    [
      "# คำสั่งสำหรับ AI",
      `คุณกำลังช่วย "${input.memberName}" หนึ่งใน 4 ผู้นำของ Up Level ปรับ Masterplan 3 ปี (Vision → Mission A–D → มิติ → KPI).`,
      "กติกา:",
      "1. ฉบับกลางแก้ได้ผ่าน \"ข้อเสนอ\" เท่านั้น — ให้ตอบเป็นข้อเสนอ ไม่ต้องเขียนเอกสารใหม่ทั้งฉบับ",
      "2. ห้ามแต่งตัวเลขเป้าหมายขึ้นเอง ถ้าต้องมีตัวเลขแต่ไม่มีข้อมูล ให้ใช้ kind \"คำถาม\" แล้วถามกลับ",
      "3. oldText ต้องคัดลอกจากเอกสารด้านล่างแบบตรงตัวทุกตัวอักษร (ถ้าเป็นการเพิ่มใหม่ ปล่อย oldText เป็น \"\")",
      "4. missions เลือกจาก \"ภาพรวม\", \"A\", \"B\", \"C\", \"D\" · kind เลือกจาก \"แก้\", \"เพิ่ม\", \"ลบ\", \"ตั้งเป้า\", \"คำถาม\"",
      "5. ตอบเป็นภาษาไทย อธิบายสั้นๆ ได้ แต่ต้องปิดท้ายด้วยบล็อก ```json ตามรูปแบบด้านล่างเสมอ"
    ].join("\n")
  );
  parts.push(`# ขอบเขตที่ขอให้ช่วย\n${input.scopeLabel}`);
  if (input.docText && input.docText.trim()) {
    parts.push(`# เอกสาร: ${input.docTitle || "ฉบับกลาง"}\n<<<เอกสาร\n${input.docText.trim()}\nเอกสาร>>>`);
  }
  if (input.scratch && input.scratch.trim()) {
    parts.push(`# กระดาษทดของ ${input.memberName}\n<<<กระดาษทด\n${input.scratch.trim()}\nกระดาษทด>>>`);
  }
  if (input.openProposals && input.openProposals.length > 0) {
    const lines = input.openProposals.map(
      (p) => `- ${p.code} [${p.status}] ${p.kind} · ${p.title}${p.location ? ` · ตำแหน่ง: ${p.location}` : ""}${p.newText ? `\n  เสนอ: ${p.newText.trim().slice(0, 400)}` : ""}`
    );
    parts.push(`# ข้อเสนอที่เปิดอยู่ (อย่าเสนอซ้ำ)\n${lines.join("\n")}`);
  }
  parts.push(`# รูปแบบคำตอบที่ต้องการ\nปิดท้ายด้วย:\n\`\`\`json\n${AI_REPLY_EXAMPLE}\n\`\`\``);
  return parts.join("\n\n");
}

/** Smart quotes, trailing commas and other things chat UIs do to JSON. */
function relaxJson(text: string): string {
  let out = text
    .replace(/[“”„‟″＂]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/ /g, " ")
    .replace(/^﻿/, "");
  out = out.replace(/,\s*([\]}])/g, "$1");
  return out;
}

/** Index of the bracket that closes the one at `start`, respecting strings. */
function matchingBracket(text: string, start: number): number {
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function candidateJsonBlocks(text: string): string[] {
  const out: string[] = [];
  const fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) out.push(match[1]);
  const first = text.indexOf("[");
  if (first >= 0) {
    const end = matchingBracket(text, first);
    out.push(end > first ? text.slice(first, end + 1) : text.slice(first));
  }
  const obj = text.indexOf("{");
  if (obj >= 0) {
    const end = matchingBracket(text, obj);
    if (end > obj) out.push(text.slice(obj, end + 1));
  }
  return out;
}

export type ParsedAiProposal = ProposalDraft & { valid: boolean; error: string | null };

/**
 * Lenient parse of an AI reply: the ```json fence, or the first [...] array, or a lone
 * object. Tolerates smart quotes and trailing commas. Each item is validated; invalid
 * ones are returned with an error so the preview can show why.
 */
export function parseAiReply(text: string): Result<ParsedAiProposal[]> {
  const source = relaxJson(text || "");
  if (!source.trim()) return { ok: false, error: "ยังไม่ได้วางคำตอบ" };
  let data: unknown = undefined;
  for (const block of candidateJsonBlocks(source)) {
    try {
      data = JSON.parse(relaxJson(block.trim()));
      break;
    } catch {
      // try the next candidate
    }
  }
  if (data === undefined) {
    return { ok: false, error: "อ่านคำตอบไม่ได้ — ไม่พบบล็อก JSON ในคำตอบ ลองขอให้ AI \"ตอบเป็นบล็อก ```json ตามรูปแบบเดิม\" แล้ววางใหม่" };
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = (data as Record<string, unknown>).proposals;
    data = Array.isArray(inner) ? inner : [data];
  }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: "คำตอบไม่มีข้อเสนอเลย" };
  const items = data.slice(0, 50).map((raw): ParsedAiProposal => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const kindRaw = str(item.kind).trim();
    const draftInput = {
      title: str(item.title),
      missions: item.missions ?? item.mission,
      location: str(item.location),
      kind: (PROPOSAL_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : str(item.oldText).trim() ? "แก้" : "เพิ่ม",
      oldText: str(item.oldText),
      newText: str(item.newText),
      reason: str(item.reason)
    };
    if (normalizeMissions(draftInput.missions).length === 0) draftInput.missions = ["ภาพรวม"];
    const checked = validateProposalDraft(draftInput);
    if (checked.ok) return { ...checked.value, valid: true, error: null };
    return {
      title: draftInput.title.trim() || "(ไม่มีหัวข้อ)",
      missions: normalizeMissions(draftInput.missions),
      location: draftInput.location,
      kind: draftInput.kind as ProposalKind,
      oldText: draftInput.oldText,
      newText: draftInput.newText,
      reason: draftInput.reason,
      valid: false,
      error: checked.error
    };
  });
  return { ok: true, value: items };
}

// ---------------------------------------------------------------- tasks

export type TaskDraft = Pick<MpTask, "title" | "detail" | "missions" | "owner" | "due" | "status">;

export function validateTaskDraft(input: unknown, memberKeys: readonly string[]): Result<TaskDraft> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = str(body.title).trim();
  if (!title) return { ok: false, error: "ใส่ชื่องาน" };
  if (title.length > 200) return { ok: false, error: "ชื่องานยาวเกินไป" };
  const detail = str(body.detail);
  if (detail.length > 10_000) return { ok: false, error: "รายละเอียดยาวเกินไป" };
  const ownerRaw = body.owner === null || body.owner === undefined ? "" : str(body.owner).trim();
  if (ownerRaw && !memberKeys.includes(ownerRaw)) return { ok: false, error: "ไม่รู้จักผู้รับผิดชอบ" };
  const dueRaw = body.due === null || body.due === undefined ? "" : str(body.due).trim();
  if (dueRaw && !isIsoDate(dueRaw)) return { ok: false, error: "วันกำหนดส่งไม่ถูกต้อง" };
  const status = body.status === undefined || body.status === "" ? "ยังไม่เริ่ม" : body.status;
  if (!isTaskStatus(status)) return { ok: false, error: "สถานะงานไม่ถูกต้อง" };
  return { ok: true, value: { title, detail, missions: normalizeMissions(body.missions), owner: ownerRaw || null, due: dueRaw || null, status } };
}

export function isOverdue(task: Pick<MpTask, "due" | "status">, today: string): boolean {
  return Boolean(task.due) && task.status !== "เสร็จ" && task.status !== "พัก" && (task.due as string) < today;
}

export type TaskImportRow = { code: string; title: string; detail: string; missions: Mission[]; due: string | null; owner: string | null; source: string };

const OWNER_HINTS: Record<string, MasterplanMemberKey> = {
  champ: "champ",
  แชมป์: "champ",
  top: "top",
  ท้อป: "top",
  name: "name",
  เนม: "name",
  muk: "muk",
  มุก: "muk"
};

export function ownerFromHint(hint: unknown): string | null {
  const text = str(hint).trim().toLowerCase();
  if (!text) return null;
  const tokens = text.split(/[^a-z฀-๿]+/).filter(Boolean);
  for (const [needle, key] of Object.entries(OWNER_HINTS)) {
    const thai = /[฀-๿]/.test(needle);
    if (tokens.includes(needle) || (thai && text.includes(needle))) return key;
  }
  return null;
}

/**
 * Parse the "นำเข้างานจาก JSON" payload: an array of {code,title,detail,mission,due,ownerHint,source}.
 * Rows without a code or title are skipped and reported; duplicate codes inside one payload keep the first.
 */
export function parseTaskImport(text: string): Result<{ rows: TaskImportRow[]; skipped: string[] }> {
  let data: unknown;
  try {
    data = JSON.parse(relaxJson(text || ""));
  } catch {
    const block = candidateJsonBlocks(relaxJson(text || ""))[0];
    try {
      data = block ? JSON.parse(relaxJson(block)) : undefined;
    } catch {
      data = undefined;
    }
  }
  if (!Array.isArray(data)) return { ok: false, error: "ต้องเป็น JSON array ของงาน เช่น [{\"code\":\"…\",\"title\":\"…\"}]" };
  const rows: TaskImportRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  data.forEach((raw, i) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const code = str(item.code).trim();
    const title = str(item.title).trim();
    if (!code || !title) {
      skipped.push(`แถว ${i + 1}: ไม่มี code หรือ title`);
      return;
    }
    if (seen.has(code)) {
      skipped.push(`แถว ${i + 1}: code ${code} ซ้ำในไฟล์`);
      return;
    }
    seen.add(code);
    const due = str(item.due).trim();
    rows.push({
      code: code.slice(0, 60),
      title: title.slice(0, 200),
      detail: str(item.detail).slice(0, 10_000),
      missions: normalizeMissions(item.mission ?? item.missions),
      due: isIsoDate(due) ? due : null,
      owner: ownerFromHint(item.ownerHint ?? item.owner),
      source: str(item.source).trim().slice(0, 200)
    });
  });
  return { ok: true, value: { rows, skipped } };
}

/** Split import rows into new ones and ones that already exist (by code) — re-import never duplicates. */
export function planTaskImport(rows: readonly TaskImportRow[], existingCodes: readonly string[]): { create: TaskImportRow[]; existing: string[] } {
  const known = new Set(existingCodes.map((code) => code.trim()));
  const create: TaskImportRow[] = [];
  const existing: string[] = [];
  for (const row of rows) {
    if (known.has(row.code)) existing.push(row.code);
    else create.push(row);
  }
  return { create, existing };
}
