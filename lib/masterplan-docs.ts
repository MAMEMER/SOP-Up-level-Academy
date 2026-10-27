// Section-level edits to a Masterplan doc ("แก้ตรง"), shared by the web route
// (/api/masterplan/docs, editors only) and the MCP tool edit_reference_section (editor tokens,
// reference docs only — never ฉบับกลาง). Optimistic concurrency: the caller sends the version
// it read; a newer stored version → conflict, nothing written.

import { checkDocSize, isDocSlug, replaceSectionBody, splitSections, MASTER_SLUG, type MpChangelog, type MpDoc } from "./masterplan.ts";
import type { MpStore } from "./masterplan-tokens.ts";

export type EditSectionInput = {
  slug: string;
  sectionIndex: number;
  baseVersion: number;
  /** the section body the edit was based on; omit to rely on the version check alone */
  baseBody?: string | null;
  newBody: string;
  reason: string;
  by: string;
  via?: { label: string };
  now?: Date;
};

export type EditSectionResult = { ok: true; version: number; heading: string } | { ok: false; error: string; conflict?: boolean };

const plain = (heading: string) => heading.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_~`]/g, "").trim();

export async function editDocSection(store: MpStore, input: EditSectionInput): Promise<EditSectionResult> {
  if (!isDocSlug(input.slug)) return { ok: false, error: "ไม่รู้จักเอกสารนี้" };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "ต้องใส่เหตุผลที่แก้ตรง" };
  if (reason.length > 2000) return { ok: false, error: "เหตุผลยาวเกินไป" };
  if (!Number.isInteger(input.baseVersion) || !Number.isInteger(input.sectionIndex)) return { ok: false, error: "ข้อมูลไม่ครบ" };
  const newBody = input.newBody.replace(/\r\n?/g, "\n");
  const now = (input.now ?? new Date()).toISOString();
  const state: { error: string | null; conflict: boolean; heading: string; title: string } = { error: null, conflict: false, heading: "", title: "" };

  const saved = await store.updateOne<MpDoc>("mp_docs", input.slug, (current) => {
    if (!current) {
      state.error = "ยังไม่ได้นำเข้าเอกสารนี้";
      return null;
    }
    if (current.version !== input.baseVersion) {
      state.conflict = true;
      state.error = `เอกสารถูกแก้ไปแล้ว (ตอนนี้ v${current.version}) — อ่านใหม่แล้วลองอีกครั้ง`;
      return null;
    }
    const section = splitSections(current.markdown)[input.sectionIndex];
    if (!section) {
      state.error = "ไม่พบหัวข้อนี้";
      return null;
    }
    state.heading = section.index === 0 ? "ส่วนนำ" : plain(section.heading);
    state.title = current.title;
    const next = replaceSectionBody(current.markdown, input.sectionIndex, input.baseBody ?? section.body, newBody);
    if (!next.ok) {
      state.error = next.error;
      return null;
    }
    const size = checkDocSize(next.value);
    if (!size.ok) {
      state.error = size.error;
      return null;
    }
    const doc: MpDoc = { ...current, markdown: next.value, version: current.version + 1, updatedAt: now, updatedBy: input.by };
    return { data: doc, result: doc };
  });
  if (!saved) return { ok: false, error: state.error ?? "บันทึกไม่สำเร็จ", conflict: state.conflict };

  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const docName = input.slug === MASTER_SLUG ? "" : `[${state.title}] `;
  const entry: MpChangelog = {
    id,
    at: now,
    by: input.by,
    version: saved.version,
    proposalCode: null,
    summary: `แก้ตรง ${docName}${state.heading} — ${reason}${input.via ? ` (ผ่าน AI: ${input.via.label})` : ""}`,
    slug: input.slug,
    ...(input.via ? { via: "ai-token" as const, viaLabel: input.via.label } : {})
  };
  await store.putOne<MpChangelog>("mp_changelog", id, entry);
  return { ok: true, version: saved.version, heading: state.heading };
}
