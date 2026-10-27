"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Lightbulb } from "lucide-react";
import { ProposalForm } from "./ProposalForm.tsx";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";

// Renders a Masterplan doc section by section. Each heading gets "เสนอแก้ตรงนี้" (opens the
// proposal form right under it, prefilled with the heading + that section's text) and, for
// editors on ฉบับกลาง, "แก้ตรง" (edit the section in place; a reason is required and goes
// to the changelog). The TOC is a sticky column on desktop and a collapsible strip on mobile.

export type DocSectionView = { index: number; level: number; heading: string; body: string; html: string };

export function DocView({
  slug,
  docLabel,
  version,
  sections,
  canEditDirect
}: {
  slug: string;
  docLabel: string;
  version: number;
  sections: DocSectionView[];
  canEditDirect: boolean;
}) {
  const toc = sections.filter((s) => s.index > 0 && s.level <= 3);
  // open on desktop (sticky side column), collapsed on mobile so the doc starts on screen one
  const [tocOpen, setTocOpen] = useState(false);
  useEffect(() => {
    try {
      setTocOpen(window.matchMedia("(min-width: 1024px)").matches);
    } catch {
      // ignore
    }
  }, []);
  return (
    <div className="mp-doc">
      {toc.length > 0 ? (
        <details className="mp-toc" open={tocOpen} onToggle={(e) => setTocOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <span>สารบัญ</span> <ChevronDown size={16} aria-hidden="true" className="mp-toc__chev" />
          </summary>
          <ol>
            {toc.map((s) => (
              <li key={s.index} className={`mp-toc__l${s.level}`}>
                <a
                  href={`#s-${s.index}`}
                  className="mp-ellipsis"
                  onClick={() => {
                    if (!window.matchMedia("(min-width: 1024px)").matches) setTocOpen(false);
                  }}
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <div className="mp-doc__body">
        {sections.map((section) => (
          <DocSection key={section.index} slug={slug} docLabel={docLabel} version={version} section={section} canEditDirect={canEditDirect} />
        ))}
      </div>
    </div>
  );
}

function DocSection({
  slug,
  docLabel,
  version,
  section,
  canEditDirect
}: {
  slug: string;
  docLabel: string;
  version: number;
  section: DocSectionView;
  canEditDirect: boolean;
}) {
  const [mode, setMode] = useState<"none" | "propose" | "edit">("none");
  const isPreamble = section.index === 0;
  if (isPreamble && !section.body.trim()) return null;
  const Heading = (`h${Math.min(6, Math.max(2, section.level + 1))}` as "h2");
  const location = isPreamble ? `${docLabel} (ส่วนนำ)` : section.heading;

  return (
    <section id={`s-${section.index}`} className={`mp-sec mp-sec--l${section.level}`}>
      {!isPreamble ? <Heading className="mp-sec__h">{section.heading}</Heading> : null}
      {section.html ? <div className="mp-md" dangerouslySetInnerHTML={{ __html: section.html }} /> : null}
      <div className="mp-sec__tools">
        <button type="button" className="mp-tool" aria-expanded={mode === "propose"} onClick={() => setMode(mode === "propose" ? "none" : "propose")}>
          <Lightbulb size={15} aria-hidden="true" /> เสนอแก้ตรงนี้
        </button>
        {canEditDirect ? (
          <button type="button" className="mp-tool" aria-expanded={mode === "edit"} onClick={() => setMode(mode === "edit" ? "none" : "edit")}>
            <Pencil size={15} aria-hidden="true" /> แก้ตรง
          </button>
        ) : null}
      </div>
      {mode === "propose" ? (
        <div className="mp-inline">
          <p className="mp-inline__title">เสนอแก้ &ldquo;{location}&rdquo;</p>
          <ProposalForm
            compact
            draftKey={`mp-propose-${slug}-${section.index}`}
            initial={{ location, oldText: section.body.trim(), newText: section.body.trim(), kind: "แก้" }}
            onCancel={() => setMode("none")}
            onDone={() => setMode("none")}
          />
        </div>
      ) : null}
      {mode === "edit" ? <SectionEditor slug={slug} version={version} section={section} onClose={() => setMode("none")} /> : null}
    </section>
  );
}

function SectionEditor({ slug, version, section, onClose }: { slug: string; version: number; section: DocSectionView; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft, clear] = useLocalDraft<{ body: string; reason: string }>(`mp-edit-${slug}-${section.index}-v${version}`, {
    body: section.body,
    reason: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft.reason.trim()) {
      setError("ต้องใส่เหตุผลที่แก้ตรง (จะขึ้นในประวัติการแก้)");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await mpApi("docs", "POST", {
      action: "edit-section",
      slug,
      baseVersion: version,
      sectionIndex: section.index,
      baseBody: section.body,
      newBody: draft.body,
      reason: draft.reason
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clear();
    onClose();
    router.refresh();
  }

  return (
    <div className="mp-inline">
      <p className="mp-inline__title">แก้ตรง — บันทึกแล้วขึ้นเวอร์ชันใหม่ทันที</p>
      <label className="mp-field">
        <span>เนื้อหาหัวข้อนี้ (Markdown)</span>
        <textarea className="mp-textarea mp-textarea--tall" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={12} />
      </label>
      <label className="mp-field">
        <span>เหตุผลที่แก้ตรง (บังคับ)</span>
        <input value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} maxLength={2000} />
      </label>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" disabled={busy} onClick={() => void save()}>
          {busy ? "กำลังบันทึก…" : "บันทึกการแก้"}
        </button>
        <button type="button" className="mp-btn mp-btn--quiet" onClick={onClose}>
          ปิด (ข้อความยังเก็บไว้)
        </button>
      </div>
    </div>
  );
}
