// Masterplan MCP server (Streamable HTTP, stateless, JSON responses) — the protocol core.
// Hand-rolled JSON-RPC 2.0 so it runs in a plain Next route handler and is unit-testable
// with an in-memory store. The route (app/api/masterplan/mcp/[token]/route.ts) verifies the
// token, rate-limits, and hands the parsed body here.
//
// Every tool acts AS the token's member. Deliberately NOT exposed: meeting verdicts,
// applying to ฉบับกลาง, direct section edits, import, token management. Writes carry
// via:"ai-token" + the token label.

import type { MasterplanMember } from "./masterplan-access.ts";
import { MASTERPLAN_MEMBERS, memberByKey, memberName } from "./masterplan-access.ts";
import {
  DEFAULT_DOC_TITLES,
  DOC_SLUGS,
  MASTER_SLUG,
  MISSIONS,
  REFERENCE_SLUGS,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  TASK_STATUSES,
  bangkokDate,
  canEditProposal,
  canTransition,
  checkDocSize,
  formatCode,
  idFromCode,
  isDocSlug,
  isMission,
  isOverdue,
  isProposalStatus,
  isTaskStatus,
  sectionWithChildren,
  splitSections,
  validateProposalDraft,
  validateTaskDraft,
  type MpDoc,
  type MpProposal,
  type MpScratch,
  type MpTask,
  type ProposalDraft
} from "./masterplan.ts";
import type { MpStore } from "./masterplan-tokens.ts";
import { editDocSection } from "./masterplan-docs.ts";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
export const SERVER_INFO = { name: "up-level-masterplan", title: "Up Level Masterplan", version: "1.0.0" };
/** No single tool result is allowed to exceed this (big docs are read per section). */
export const READ_CAP = 30_000;

export const RPC = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603, UNAUTHORIZED: -32001 } as const;

type JsonRpcId = string | number | null;
export type JsonRpcResponse = { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string } };
export type McpContext = { member: MasterplanMember; tokenLabel: string; store: MpStore; now?: () => Date };

class ParamsError extends Error {}

const SERVER_INSTRUCTIONS = [
  "Up Level Masterplan — แผน 3 ปีของ Up Level (Vision → Mission A–D → มิติ → KPI) ที่ 4 ผู้นำทำร่วมกัน.",
  "เริ่มด้วย get_overview เสมอ. อ่านเอกสารทีละหัวข้อด้วย read_doc (ห้ามขอทั้งฉบับทีเดียว).",
  "กติกา: ห้ามแต่งตัวเลขเป้าหมายขึ้นเอง · ฉบับกลางแก้ได้ผ่านข้อเสนอ (create_proposal) เท่านั้น · คุณตัดสินมติหรือนำเข้าฉบับกลางไม่ได้ — ทีมตัดสินในการคุยประจำวัน.",
  "Start with get_overview. Read docs section by section. Never invent target numbers. The central doc changes only through proposals; you cannot decide or apply them."
].join("\n");

// ---------------------------------------------------------------- helpers

const str = (v: unknown) => (typeof v === "string" ? v : "");
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n\n…(ตัดที่ ${max.toLocaleString("en-US")} ตัวอักษร / truncated)` : text);
const plain = (heading: string) => heading.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_~`]/g, "").trim();
const textResult = (text: string, isError = false) => ({ content: [{ type: "text", text: clip(text, READ_CAP + 2_000) }], ...(isError ? { isError: true } : {}) });
const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

function argsObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new ParamsError("arguments must be an object");
  return value as Record<string, unknown>;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new ParamsError(`missing required string argument: ${key}`);
  return value;
}

/** Table of contents: index + heading + level + size, for read_doc / the read link. */
export function docToc(markdown: string) {
  return splitSections(markdown)
    .filter((s) => s.index > 0 || s.body.trim())
    .map((s) => ({ index: s.index, level: s.level, heading: s.index === 0 ? "(ส่วนนำ / preamble)" : plain(s.heading), chars: s.body.length }));
}

/** Resolve "3", 3 or heading text (case-insensitive, exact first then contains) to a section index. */
export function resolveSection(markdown: string, section: unknown): number | null {
  const sections = splitSections(markdown);
  if (typeof section === "number" || (typeof section === "string" && /^\d+$/.test(section.trim()))) {
    const index = Number(section);
    return sections[index] ? index : null;
  }
  const wanted = str(section).trim().replace(/^#+\s*/, "").toLowerCase();
  if (!wanted) return null;
  const exact = sections.find((s) => s.index > 0 && plain(s.heading).toLowerCase() === wanted);
  if (exact) return exact.index;
  const partial = sections.find((s) => s.index > 0 && plain(s.heading).toLowerCase().includes(wanted));
  return partial ? partial.index : null;
}

/** One section (with its sub-sections when they fit), capped at READ_CAP. */
export function readSectionText(markdown: string, index: number, cap = READ_CAP): string {
  const withChildren = sectionWithChildren(markdown, index);
  if (withChildren.length <= cap) return withChildren;
  const section = splitSections(markdown)[index];
  const own = index === 0 ? section.body : `${"#".repeat(section.level)} ${section.heading}\n${section.body}`;
  const children = splitSections(markdown)
    .filter((s) => s.index > index && s.start < section.start + withChildren.length && s.level > section.level)
    .map((s) => `- ${s.index}: ${plain(s.heading)}`);
  return `${clip(own, cap)}\n\n(หัวข้อนี้ยาวเกิน — อ่านหัวข้อย่อยทีละอัน / section too long, read sub-sections individually:)\n${children.join("\n")}`;
}

export function searchDocs(docs: readonly Pick<MpDoc, "slug" | "markdown">[], query: string, limit = 20) {
  const needle = query.trim().toLowerCase();
  const hits: { slug: string; section: number; heading: string; snippet: string }[] = [];
  if (!needle) return hits;
  for (const doc of docs) {
    for (const section of splitSections(doc.markdown)) {
      const haystack = `${section.heading}\n${section.body}`;
      const lower = haystack.toLowerCase();
      let from = 0;
      for (let perSection = 0; perSection < 3; perSection += 1) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        const start = Math.max(0, at - 80);
        const end = Math.min(haystack.length, at + needle.length + 80);
        hits.push({
          slug: doc.slug,
          section: section.index,
          heading: section.index === 0 ? "(ส่วนนำ)" : plain(section.heading),
          snippet: `${start > 0 ? "…" : ""}${haystack.slice(start, end).replace(/\s+/g, " ")}${end < haystack.length ? "…" : ""}`
        });
        if (hits.length >= limit) return hits;
        from = at + needle.length;
      }
    }
  }
  return hits;
}

function compactProposal(p: MpProposal) {
  return {
    code: p.code,
    status: p.status,
    title: p.title,
    proposer: memberName(p.proposer),
    proposerKey: p.proposer,
    missions: p.missions,
    kind: p.kind,
    location: p.location,
    oldText: clip(p.oldText, 800),
    newText: clip(p.newText, 800),
    reason: clip(p.reason, 400),
    decidedOn: p.decidedOn,
    decisionNote: p.decisionNote,
    viaAi: p.via === "ai-token"
  };
}

function compactTask(t: MpTask, today: string) {
  return {
    code: t.code,
    title: t.title,
    detail: clip(t.detail, 400),
    status: t.status,
    owner: t.owner ? memberName(t.owner) : null,
    ownerKey: t.owner,
    due: t.due,
    overdue: isOverdue(t, today),
    missions: t.missions
  };
}

async function findByCode<T extends { code: string }>(store: MpStore, collection: string, code: unknown): Promise<T | null> {
  const wanted = str(code).trim().toUpperCase();
  if (!wanted) throw new ParamsError("missing required string argument: code");
  const all = await store.listAll<T>(collection);
  return all.find((item) => item.code.toUpperCase() === wanted) ?? null;
}

// ---------------------------------------------------------------- tools

const missionsSchema = { type: "array", items: { type: "string", enum: [...MISSIONS] }, description: "ภาพรวม / A / B / C / D" };
const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  /** only listed / callable for editor members (แชมป์, ท้อป) */
  editorOnly?: boolean;
  run: (args: Record<string, unknown>, ctx: McpContext) => Promise<ReturnType<typeof textResult>>;
};

export const TOOLS: Tool[] = [
  {
    name: "get_overview",
    title: "ภาพรวม Masterplan",
    description: "เริ่มที่นี่: ฉันคือใคร กติกา จำนวนข้อเสนอรอคุย/งานของฉัน/งานเลยกำหนด รายชื่อเอกสารพร้อมหัวข้อ และวันที่วันนี้. Start here: who I am, the rules, counts, docs with section titles, today's date (Asia/Bangkok).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    run: async (_args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const today = bangkokDate(now);
      const [docs, proposals, tasks] = await Promise.all([
        ctx.store.listAll<MpDoc>("mp_docs"),
        ctx.store.listAll<MpProposal>("mp_proposals"),
        ctx.store.listAll<MpTask>("mp_tasks")
      ]);
      const me = ctx.member;
      return textResult(
        jsonText({
          me: { key: me.key, name: me.name },
          team: MASTERPLAN_MEMBERS.map((m) => ({ key: m.key, name: m.name })),
          today,
          rules: [
            "ห้ามแต่งตัวเลขเป้าหมายขึ้นเอง ถ้าไม่มีข้อมูลให้เสนอแบบ kind \"คำถาม\" / Never invent target numbers.",
            "ฉบับกลาง (slug master) แก้ได้ผ่านข้อเสนอเท่านั้น / The central doc changes only via proposals.",
            "คุณตัดสินมติ (ลง/ไม่ลง/พักไว้) หรือนำเข้าฉบับกลางไม่ได้ ทีมตัดสินในการคุยประจำวัน / You cannot decide or apply proposals.",
            "oldText ต้องคัดลอกจากเอกสารตรงตัว / oldText must be copied verbatim from the doc.",
            "อ่านเอกสารทีละหัวข้อด้วย read_doc / Read docs one section at a time."
          ],
          counts: {
            waitingForMeeting: proposals.filter((p) => p.status === "รอคุย").length,
            myDrafts: proposals.filter((p) => p.status === "ร่าง" && p.proposer === me.key).length,
            myOpenTasks: tasks.filter((t) => t.owner === me.key && t.status !== "เสร็จ").length,
            overdueTasks: tasks.filter((t) => isOverdue(t, today)).length
          },
          docs: DOC_SLUGS.map((slug) => {
            const doc = docs.find((d) => d.slug === slug);
            return doc
              ? {
                  slug,
                  title: doc.title,
                  version: doc.version,
                  chars: doc.markdown.length,
                  sections: docToc(doc.markdown)
                    .filter((s) => s.level > 0 && s.level <= 2)
                    .map((s) => `${s.index}: ${s.heading}`)
                }
              : { slug, title: DEFAULT_DOC_TITLES[slug], imported: false };
          })
        })
      );
    }
  },
  {
    name: "read_doc",
    title: "อ่านเอกสาร",
    description:
      "อ่านเอกสาร Masterplan. ไม่ใส่ section = ได้สารบัญ (index + หัวข้อ). ใส่ section (เลข index หรือชื่อหัวข้อ) = ได้ markdown ของหัวข้อนั้น. Read a doc: without section → table of contents; with section (index or heading text) → that section's markdown (capped at 30k chars).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", enum: [...DOC_SLUGS], description: "master = ฉบับกลาง; others are read-only references" },
        section: { type: "string", description: "section index from the TOC (e.g. \"3\"), or heading text" }
      },
      required: ["slug"],
      additionalProperties: false
    },
    readOnly: true,
    run: async (args, ctx) => {
      const slug = requireString(args, "slug");
      if (!isDocSlug(slug)) throw new ParamsError(`unknown slug: ${slug}`);
      const doc = await ctx.store.getOne<MpDoc>("mp_docs", slug);
      if (!doc) return textResult(`ยังไม่ได้นำเข้าเอกสาร ${slug} / not imported yet`, true);
      if (args.section === undefined || args.section === null || args.section === "") {
        return textResult(
          `# ${doc.title} (v${doc.version}, ${doc.markdown.length.toLocaleString("en-US")} chars)\nสารบัญ — เรียก read_doc ซ้ำพร้อม section เพื่ออ่านทีละหัวข้อ / call again with section.\n\n` +
            docToc(doc.markdown)
              .map((s) => `${"  ".repeat(Math.max(0, s.level - 1))}${s.index}: ${s.heading} (${s.chars} chars)`)
              .join("\n")
        );
      }
      const index = resolveSection(doc.markdown, args.section);
      if (index === null) return textResult(`ไม่พบหัวข้อ "${String(args.section)}" — ดูสารบัญด้วย read_doc แบบไม่ใส่ section / section not found`, true);
      return textResult(`<!-- ${doc.title} v${doc.version} · section ${index} -->\n${readSectionText(doc.markdown, index)}`);
    }
  },
  {
    name: "search_docs",
    title: "ค้นในเอกสาร",
    description: "ค้นคำในเอกสาร Masterplan ทุกฉบับ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) ได้ slug, section, ข้อความรอบๆ. Case-insensitive search across all docs → slug, section index, snippet.",
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false },
    readOnly: true,
    run: async (args, ctx) => {
      const query = requireString(args, "query");
      const hits = searchDocs(await ctx.store.listAll<MpDoc>("mp_docs"), query);
      return textResult(hits.length ? jsonText(hits) : `ไม่พบ "${query}" / no matches`);
    }
  },
  {
    name: "list_proposals",
    title: "รายการข้อเสนอ",
    description: "ดูข้อเสนอแก้ฉบับกลาง กรองตามสถานะ/คนเสนอ/Mission (ร่างของคนอื่นจะไม่แสดง). List proposals, optionally filtered; other people's drafts are private.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...PROPOSAL_STATUSES] },
        proposer: { type: "string", enum: [...memberKeys, "me"] },
        mission: { type: "string", enum: [...MISSIONS] }
      },
      additionalProperties: false
    },
    readOnly: true,
    run: async (args, ctx) => {
      const status = str(args.status);
      const proposer = str(args.proposer) === "me" ? ctx.member.key : str(args.proposer);
      const mission = str(args.mission);
      if (status && !isProposalStatus(status)) throw new ParamsError("invalid status");
      if (mission && !isMission(mission)) throw new ParamsError("invalid mission");
      const all = await ctx.store.listAll<MpProposal>("mp_proposals");
      const list = all
        .filter((p) => p.status !== "ร่าง" || p.proposer === ctx.member.key)
        .filter((p) => (!status || p.status === status) && (!proposer || p.proposer === proposer) && (!mission || p.missions.includes(mission as never)))
        .sort((a, b) => b.code.localeCompare(a.code, "en", { numeric: true }));
      return textResult(list.length ? jsonText(list.slice(0, 100).map(compactProposal)) : "ไม่มีข้อเสนอตามเงื่อนไข / none");
    }
  },
  {
    name: "create_proposal",
    title: "สร้างข้อเสนอ",
    description:
      "สร้างข้อเสนอแก้ฉบับกลางในนามของฉัน (เป็นร่าง หรือส่งเข้าวาระทันทีถ้า submit=true). oldText ต้องคัดลอกจากเอกสารตรงตัว. ห้ามแต่งตัวเลข. Create a proposal as me: status ร่าง (draft), or รอคุย (on the agenda) when submit is true.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        missions: missionsSchema,
        location: { type: "string", description: "section heading or KPI code" },
        kind: { type: "string", enum: [...PROPOSAL_KINDS] },
        oldText: { type: "string", description: "verbatim text from the doc (empty for เพิ่ม/คำถาม)" },
        newText: { type: "string" },
        reason: { type: "string" },
        submit: { type: "boolean", description: "true = send to today's agenda (รอคุย)" }
      },
      required: ["title", "missions", "kind"],
      additionalProperties: false
    },
    readOnly: false,
    run: async (args, ctx) => {
      const checked = validateProposalDraft(args);
      if (!checked.ok) return textResult(checked.error, true);
      const code = formatCode("P", await ctx.store.nextSequence("proposal"));
      const id = idFromCode(code);
      const now = (ctx.now ?? (() => new Date()))().toISOString();
      const record: MpProposal = {
        id,
        code,
        ...checked.value,
        proposer: ctx.member.key,
        status: args.submit === true ? "รอคุย" : "ร่าง",
        decidedOn: null,
        decisionNote: "",
        createdAt: now,
        updatedAt: now,
        via: "ai-token",
        viaLabel: ctx.tokenLabel
      };
      await ctx.store.putOne<MpProposal>("mp_proposals", id, record);
      return textResult(`สร้าง ${code} แล้ว (${record.status}) / created ${code} as ${record.status}`);
    }
  },
  {
    name: "update_my_proposal",
    title: "แก้ข้อเสนอของฉัน",
    description: "แก้ข้อเสนอของฉันที่ยังเป็นร่าง/รอคุย (ใส่เฉพาะช่องที่จะเปลี่ยน). submit=true ส่งร่างเข้าวาระ. Edit MY own proposal while ร่าง/รอคุย (send only changed fields); submit=true moves ร่าง→รอคุย.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "e.g. P-012" },
        title: { type: "string" },
        missions: missionsSchema,
        location: { type: "string" },
        kind: { type: "string", enum: [...PROPOSAL_KINDS] },
        oldText: { type: "string" },
        newText: { type: "string" },
        reason: { type: "string" },
        submit: { type: "boolean" }
      },
      required: ["code"],
      additionalProperties: false
    },
    readOnly: false,
    run: async (args, ctx) => {
      const found = await findByCode<MpProposal>(ctx.store, "mp_proposals", args.code);
      if (!found) return textResult(`ไม่พบข้อเสนอ ${str(args.code)} / not found`, true);
      const actor = { key: ctx.member.key, editor: false };
      if (!canEditProposal(found, actor)) return textResult("แก้ได้เฉพาะข้อเสนอของตัวเองที่ยังเป็นร่าง/รอคุย / only your own ร่าง/รอคุย proposals", true);
      const fields: (keyof ProposalDraft)[] = ["title", "missions", "location", "kind", "oldText", "newText", "reason"];
      const merged: Record<string, unknown> = { ...found };
      for (const field of fields) if (args[field] !== undefined) merged[field] = args[field];
      const checked = validateProposalDraft(merged);
      if (!checked.ok) return textResult(checked.error, true);
      const now = (ctx.now ?? (() => new Date()))().toISOString();
      const result = await ctx.store.updateOne<MpProposal, string>("mp_proposals", found.id, (current) => {
        if (!current || !canEditProposal(current, actor)) return null;
        const status = args.submit === true && canTransition(current, "รอคุย", actor) ? "รอคุย" : current.status;
        return { data: { ...current, ...checked.value, status, updatedAt: now, via: "ai-token", viaLabel: ctx.tokenLabel }, result: status };
      });
      if (!result) return textResult("แก้ไม่ได้ (สถานะเปลี่ยนไปแล้ว) / could not update", true);
      return textResult(`แก้ ${found.code} แล้ว (${result}) / updated`);
    }
  },
  {
    name: "read_scratch",
    title: "อ่านกระดาษทด",
    description: "อ่านกระดาษทด (โน้ตส่วนตัว) ของฉัน หรือของคนอื่นในทีม. Read a scratchpad — mine by default, or a teammate's (read-only).",
    inputSchema: { type: "object", properties: { member: { type: "string", enum: [...memberKeys, "me"] } }, additionalProperties: false },
    readOnly: true,
    run: async (args, ctx) => {
      const key = !args.member || args.member === "me" ? ctx.member.key : str(args.member);
      const who = memberByKey(key);
      if (!who) throw new ParamsError("unknown member");
      const scratch = await ctx.store.getOne<MpScratch>("mp_scratch", who.key);
      return textResult(scratch?.markdown.trim() ? clip(scratch.markdown, READ_CAP) : `กระดาษทดของ${who.name}ยังว่าง / empty`);
    }
  },
  {
    name: "write_my_scratch",
    title: "เขียนกระดาษทดของฉัน",
    description:
      "เขียนกระดาษทดของฉันเท่านั้น. mode=append เพิ่มบล็อกใหม่มีวันที่ (แนะนำ). mode=replace แทนทั้งหมด — ต้องส่งข้อความทั้งฉบับ. Write MY scratchpad only: append adds a dated block (preferred); replace overwrites — send the full text.",
    inputSchema: {
      type: "object",
      properties: { markdown: { type: "string" }, mode: { type: "string", enum: ["append", "replace"] } },
      required: ["markdown", "mode"],
      additionalProperties: false
    },
    readOnly: false,
    run: async (args, ctx) => {
      const markdown = str(args.markdown);
      const mode = str(args.mode);
      if (mode !== "append" && mode !== "replace") throw new ParamsError("mode must be append or replace");
      if (mode === "append" && !markdown.trim()) throw new ParamsError("markdown is empty");
      const now = (ctx.now ?? (() => new Date()))();
      const stamp = `${bangkokDate(now)} ${new Date(now.getTime() + 7 * 3600_000).toISOString().slice(11, 16)}`;
      const state: { failure: string | null } = { failure: null };
      await ctx.store.updateOne<MpScratch>("mp_scratch", ctx.member.key, (current) => {
        const next =
          mode === "replace"
            ? markdown
            : `${(current?.markdown ?? "").replace(/\s+$/, "")}${current?.markdown.trim() ? "\n\n" : ""}### ${stamp} (จาก AI: ${ctx.tokenLabel})\n${markdown.trim()}\n`;
        const size = checkDocSize(next);
        if (!size.ok) {
          state.failure = size.error;
          return null;
        }
        const data: MpScratch = { member: ctx.member.key, markdown: next, updatedAt: now.toISOString(), via: "ai-token", viaLabel: ctx.tokenLabel };
        return { data, result: data };
      });
      if (state.failure) return textResult(state.failure, true);
      return textResult(mode === "append" ? "เพิ่มลงกระดาษทดแล้ว / appended" : "แทนที่กระดาษทดแล้ว / replaced");
    }
  },
  {
    name: "list_tasks",
    title: "รายการงาน",
    description: "ดูงานตามแผน กรองตามคนทำ/สถานะ/Mission/เฉพาะที่เลยกำหนด. List tasks; filters: owner (member key, \"me\", or \"none\"), status, mission, overdueOnly.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", enum: [...memberKeys, "me", "none"] },
        status: { type: "string", enum: [...TASK_STATUSES] },
        mission: { type: "string", enum: [...MISSIONS] },
        overdueOnly: { type: "boolean" }
      },
      additionalProperties: false
    },
    readOnly: true,
    run: async (args, ctx) => {
      const today = bangkokDate((ctx.now ?? (() => new Date()))());
      const owner = str(args.owner) === "me" ? ctx.member.key : str(args.owner);
      const status = str(args.status);
      const mission = str(args.mission);
      if (status && !isTaskStatus(status)) throw new ParamsError("invalid status");
      const tasks = (await ctx.store.listAll<MpTask>("mp_tasks"))
        .filter((t) => (owner === "none" ? t.owner === null : !owner || t.owner === owner))
        .filter((t) => (!status || t.status === status) && (!mission || t.missions.includes(mission as never)) && (!args.overdueOnly || isOverdue(t, today)))
        .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
      return textResult(tasks.length ? jsonText(tasks.slice(0, 150).map((t) => compactTask(t, today))) : "ไม่มีงานตามเงื่อนไข / none");
    }
  },
  {
    name: "create_task",
    title: "สร้างงาน",
    description: "สร้างงานใหม่ (code T-### อัตโนมัติ). Create a task; owner is a member key or omitted; due is YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        missions: missionsSchema,
        owner: { type: "string", enum: [...memberKeys, "me"] },
        due: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["title"],
      additionalProperties: false
    },
    readOnly: false,
    run: async (args, ctx) => {
      const checked = validateTaskDraft({ ...args, owner: args.owner === "me" ? ctx.member.key : args.owner, status: "ยังไม่เริ่ม" }, memberKeys);
      if (!checked.ok) return textResult(checked.error, true);
      const code = formatCode("T", await ctx.store.nextSequence("task"));
      const now = (ctx.now ?? (() => new Date()))().toISOString();
      const task: MpTask = {
        id: idFromCode(code),
        code,
        ...checked.value,
        source: `AI: ${ctx.tokenLabel}`,
        createdBy: ctx.member.key,
        createdAt: now,
        updatedAt: now,
        via: "ai-token",
        viaLabel: ctx.tokenLabel
      };
      await ctx.store.putOne<MpTask>("mp_tasks", task.id, task);
      return textResult(`สร้างงาน ${code} แล้ว / created ${code}`);
    }
  },
  {
    name: "claim_task",
    title: "หยิบงาน",
    description: "หยิบงานมาทำ (ตั้งฉันเป็นคนทำ). Claim a task: sets me as owner (and กำลังทำ if it hadn't started).",
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"], additionalProperties: false },
    readOnly: false,
    run: async (args, ctx) => {
      const found = await findByCode<MpTask>(ctx.store, "mp_tasks", args.code);
      if (!found) return textResult(`ไม่พบงาน ${str(args.code)} / not found`, true);
      const now = (ctx.now ?? (() => new Date()))().toISOString();
      await ctx.store.updateOne<MpTask>("mp_tasks", found.id, (current) =>
        current
          ? {
              data: { ...current, owner: ctx.member.key, status: current.status === "ยังไม่เริ่ม" ? "กำลังทำ" : current.status, updatedAt: now, via: "ai-token", viaLabel: ctx.tokenLabel },
              result: current
            }
          : null
      );
      return textResult(`หยิบ ${found.code} แล้ว / claimed`);
    }
  },
  {
    name: "set_task_status",
    title: "เปลี่ยนสถานะงาน",
    description: "เปลี่ยนสถานะงาน. Set a task's status.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" }, status: { type: "string", enum: [...TASK_STATUSES] } },
      required: ["code", "status"],
      additionalProperties: false
    },
    readOnly: false,
    run: async (args, ctx) => {
      const status = str(args.status);
      if (!isTaskStatus(status)) throw new ParamsError("invalid status");
      const found = await findByCode<MpTask>(ctx.store, "mp_tasks", args.code);
      if (!found) return textResult(`ไม่พบงาน ${str(args.code)} / not found`, true);
      const now = (ctx.now ?? (() => new Date()))().toISOString();
      await ctx.store.updateOne<MpTask>("mp_tasks", found.id, (current) =>
        current ? { data: { ...current, status, updatedAt: now, via: "ai-token", viaLabel: ctx.tokenLabel }, result: current } : null
      );
      return textResult(`${found.code} → ${status}`);
    }
  },
  {
    name: "edit_reference_section",
    title: "แก้หัวข้อในเอกสารอ้างอิง (เฉพาะผู้แก้)",
    description:
      "แก้เนื้อหาหัวข้อเดียวในเอกสารอ้างอิง (mission-a..d, research, roadmap) ทันที ต้องมีเหตุผล — ใช้ได้เฉพาะแชมป์/ท้อป และใช้กับฉบับกลางไม่ได้ (ฉบับกลางต้องเสนอผ่าน create_proposal). อ่านหัวข้อด้วย read_doc ก่อน แล้วส่ง baseVersion ที่อ่านมา. newBody = เนื้อหาใต้หัวข้อนี้เท่านั้น (ไม่รวมบรรทัดหัวข้อและหัวข้อย่อย). Editors only: replace one section's own body in a REFERENCE doc (never master). Read it first and pass the version you read as baseVersion; newBody excludes the heading line and sub-sections.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", enum: [...REFERENCE_SLUGS] },
        section: { type: "string", description: "section index (e.g. \"3\") or heading text" },
        baseVersion: { type: "integer", description: "the doc version you read (shown by read_doc as vN)" },
        newBody: { type: "string" },
        reason: { type: "string" }
      },
      required: ["slug", "section", "baseVersion", "newBody", "reason"],
      additionalProperties: false
    },
    readOnly: false,
    editorOnly: true,
    run: async (args, ctx) => {
      const slug = requireString(args, "slug");
      if (slug === MASTER_SLUG) return textResult("ฉบับกลางแก้ตรงผ่าน AI ไม่ได้ — ใช้ create_proposal แทน / the central doc is proposal-only", true);
      if (!(REFERENCE_SLUGS as readonly string[]).includes(slug)) throw new ParamsError(`unknown reference slug: ${slug}`);
      if (typeof args.baseVersion !== "number" || !Number.isInteger(args.baseVersion)) throw new ParamsError("baseVersion must be an integer");
      if (typeof args.newBody !== "string") throw new ParamsError("missing required string argument: newBody");
      const reason = requireString(args, "reason");
      const doc = await ctx.store.getOne<MpDoc>("mp_docs", slug);
      if (!doc) return textResult(`ยังไม่ได้นำเข้าเอกสาร ${slug} / not imported yet`, true);
      const index = resolveSection(doc.markdown, args.section);
      if (index === null) return textResult(`ไม่พบหัวข้อ "${String(args.section)}" / section not found`, true);
      const edited = await editDocSection(ctx.store, {
        slug,
        sectionIndex: index,
        baseVersion: args.baseVersion,
        newBody: args.newBody,
        reason,
        by: ctx.member.key,
        via: { label: ctx.tokenLabel },
        now: (ctx.now ?? (() => new Date()))()
      });
      if (!edited.ok) return textResult(edited.error, true);
      return textResult(`แก้ "${edited.heading}" ใน ${doc.title} แล้ว → v${edited.version} / saved as v${edited.version}`);
    }
  }
];

/** Tools this member may use (editor-only tools are absent for everyone else). */
export function toolsFor(member: Pick<MasterplanMember, "editor">): Tool[] {
  return TOOLS.filter((tool) => !tool.editorOnly || member.editor);
}

export function toolList(member: Pick<MasterplanMember, "editor">) {
  return toolsFor(member).map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false }
  }));
}

// ---------------------------------------------------------------- JSON-RPC

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

/** Handle one JSON-RPC message. Returns null for notifications (nothing to send back). */
export async function handleMessage(message: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return rpcError(null, RPC.INVALID_REQUEST, "Invalid Request");
  const msg = message as Record<string, unknown>;
  const hasId = "id" in msg && (typeof msg.id === "string" || typeof msg.id === "number");
  const id: JsonRpcId = hasId ? (msg.id as string | number) : null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    // a response object from the client (result/error, no method) needs no reply
    if (msg.jsonrpc === "2.0" && hasId && ("result" in msg || "error" in msg)) return null;
    return rpcError(id, RPC.INVALID_REQUEST, "Invalid Request");
  }
  const method = msg.method;
  if (!hasId) return null; // notifications (notifications/initialized, cancelled, …)
  const params = msg.params;
  if (params !== undefined && (typeof params !== "object" || params === null)) return rpcError(id, RPC.INVALID_PARAMS, "params must be an object");
  const p = (params ?? {}) as Record<string, unknown>;

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: negotiateVersion(p.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS
        });
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: toolList(ctx.member) });
      case "tools/call": {
        const name = p.name;
        if (typeof name !== "string") return rpcError(id, RPC.INVALID_PARAMS, "params.name is required");
        const tool = toolsFor(ctx.member).find((t) => t.name === name);
        if (!tool) return rpcError(id, RPC.INVALID_PARAMS, `Unknown tool: ${name}`);
        const args = argsObject(p.arguments);
        return ok(id, await tool.run(args, ctx));
      }
      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (error) {
    if (error instanceof ParamsError) return rpcError(id, RPC.INVALID_PARAMS, error.message);
    return rpcError(id, RPC.INTERNAL, "Internal error");
  }
}

/**
 * Handle a POST body (single message or batch). `responses` is null when nothing needs a
 * reply (only notifications/responses) → the route answers 202 with no body.
 */
export async function handleBody(body: unknown, ctx: McpContext): Promise<{ responses: JsonRpcResponse | JsonRpcResponse[] | null }> {
  if (Array.isArray(body)) {
    if (body.length === 0) return { responses: rpcError(null, RPC.INVALID_REQUEST, "Empty batch") };
    if (body.length > 20) return { responses: rpcError(null, RPC.INVALID_REQUEST, "Batch too large") };
    const out: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleMessage(message, ctx);
      if (response) out.push(response);
    }
    return { responses: out.length ? out : null };
  }
  return { responses: await handleMessage(body, ctx) };
}
