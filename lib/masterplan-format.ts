// Display helpers for the Masterplan pages (Thai, Asia/Bangkok).

import type { MpProposal } from "./masterplan.ts";

export function thaiDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export function thaiDate(ymd: string | null | undefined): string {
  if (!ymd) return "-";
  const date = new Date(`${ymd}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
}

/** Proposals worth showing the AI so it doesn't repeat them: everyone's live ones + my drafts. */
export function openProposalsFor(proposals: readonly MpProposal[], memberKey: string) {
  return proposals
    .filter((p) => p.status === "รอคุย" || p.status === "พักไว้" || p.status === "ลง" || (p.status === "ร่าง" && p.proposer === memberKey))
    .map(({ code, title, status, location, kind, newText }) => ({ code, title, status, location, kind, newText }));
}
