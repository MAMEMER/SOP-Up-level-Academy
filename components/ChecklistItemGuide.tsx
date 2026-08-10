"use client";

import { linkLabel, type ItemLink } from "../lib/checklist-links.ts";

// Staff-facing render of the owner's per-item รายละเอียด (note) + ปุ่มลิงก์ (links).
// Shared by every checklist view (daily / weekly stock / monthly stock / weekly event) so a note
// and a set of link buttons look and behave the same everywhere. Renders nothing — no wrapper, no
// spacing — when the item has neither a note nor a link, so an item without a guide is untouched.
export function ChecklistItemGuide({ note, links }: { note?: string; links?: ItemLink[] }) {
  const hasNote = Boolean(note && note.trim());
  const shownLinks = links || [];
  if (!hasNote && shownLinks.length === 0) return null;
  return (
    <div className="item-guide">
      {hasNote ? <p className="item-guide-note">{note}</p> : null}
      {shownLinks.length ? (
        <div className="item-guide-links">
          {shownLinks.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              className="item-guide-link"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {linkLabel(link)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
