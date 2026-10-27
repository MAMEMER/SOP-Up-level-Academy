"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { MAX_DOC_BYTES, byteLength, parseTaskImport } from "../../lib/masterplan.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";

// Import a whole doc (paste or .md upload) and import tasks from JSON (idempotent by code).

type Target = { slug: string; title: string; version: number };

export function ImportForms({ targets }: { targets: Target[] }) {
  return (
    <>
      <DocImport targets={targets} />
      <TaskImport />
    </>
  );
}

function DocImport({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [draft, setDraft, clear] = useLocalDraft<{ slug: string; title: string; markdown: string }>("mp-import-doc", {
    slug: targets[0]?.slug ?? "master",
    title: targets[0]?.title ?? "",
    markdown: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const target = targets.find((t) => t.slug === draft.slug);
  const bytes = byteLength(draft.markdown);

  function pickTarget(slug: string) {
    const next = targets.find((t) => t.slug === slug);
    setDraft((d) => ({ ...d, slug, title: next?.title ?? d.title }));
  }

  async function readFile(file: File) {
    if (file.size > MAX_DOC_BYTES) {
      setError("ไฟล์ใหญ่เกินไป");
      return;
    }
    const text = await file.text();
    setDraft((d) => ({ ...d, markdown: text }));
    setError(null);
  }

  async function save() {
    if (target && target.version > 0 && !window.confirm(`แทนที่ "${target.title}" ทั้งเอกสาร (ตอนนี้ v${target.version})?`)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await mpApi<{ version: number }>("docs", "POST", { action: "import", slug: draft.slug, title: draft.title, markdown: draft.markdown });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(`นำเข้าแล้ว — ${draft.title || draft.slug} เวอร์ชัน ${res.data.version}`);
    clear();
    router.refresh();
  }

  return (
    <div className="mp-block">
      <h2 className="mp-h2">นำเข้าเอกสาร</h2>
      <div className="mp-row2">
        <label className="mp-field">
          <span>เอกสารปลายทาง</span>
          <select value={draft.slug} onChange={(e) => pickTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.slug === "master" ? "ฉบับกลาง" : t.title} {t.version > 0 ? `(v${t.version})` : "(ยังว่าง)"}
              </option>
            ))}
          </select>
        </label>
        <label className="mp-field">
          <span>ชื่อเอกสาร</span>
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={200} />
        </label>
      </div>
      <label className="mp-upload">
        <Upload size={16} aria-hidden="true" /> เลือกไฟล์ .md
        <input
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <label className="mp-field">
        <span>หรือวางเนื้อหา Markdown</span>
        <textarea className="mp-textarea mp-textarea--tall" rows={12} value={draft.markdown} onChange={(e) => setDraft((d) => ({ ...d, markdown: e.target.value }))} />
      </label>
      <p className={`mp-meta${bytes > MAX_DOC_BYTES ? " mp-overdue" : ""}`}>
        {draft.markdown.length.toLocaleString("th-TH")} ตัวอักษร · {Math.round(bytes / 1024)} KB จาก {Math.round(MAX_DOC_BYTES / 1024)} KB
      </p>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mp-ok" role="status">
          {done}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" disabled={busy || !draft.markdown.trim() || bytes > MAX_DOC_BYTES} onClick={() => void save()}>
          {busy ? "กำลังนำเข้า…" : "นำเข้าเอกสาร"}
        </button>
      </div>
    </div>
  );
}

function TaskImport() {
  const router = useRouter();
  const [text, setText, clear] = useLocalDraft<string>("mp-import-tasks", "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const preview = text.trim() ? parseTaskImport(text) : null;

  async function save() {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await mpApi<{ created: number; existing: number; skipped: string[] }>("tasks", "POST", { action: "import", text });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { created, existing, skipped } = res.data;
    setDone(`เพิ่มงานใหม่ ${created} · มีอยู่แล้ว ${existing} (ไม่เพิ่มซ้ำ)${skipped.length ? ` · ข้าม ${skipped.length}` : ""}`);
    clear();
    router.refresh();
  }

  return (
    <div className="mp-block">
      <h2 className="mp-h2">นำเข้างานจาก JSON</h2>
      <p className="mp-sub">
        รูปแบบ: array ของ {"{code, title, detail, mission, due, ownerHint, source}"} — นำเข้าซ้ำได้ งานที่ code ซ้ำจะไม่ถูกเพิ่มอีก
      </p>
      <label className="mp-field">
        <span>วาง JSON</span>
        <textarea className="mp-textarea mp-textarea--tall" rows={8} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {preview ? (
        preview.ok ? (
          <p className="mp-meta">
            อ่านได้ {preview.value.rows.length} งาน{preview.value.skipped.length ? ` · ข้าม ${preview.value.skipped.length}: ${preview.value.skipped.slice(0, 3).join(", ")}` : ""}
          </p>
        ) : (
          <p className="mp-error">{preview.error}</p>
        )
      ) : null}
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mp-ok" role="status">
          {done}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" disabled={busy || !preview?.ok} onClick={() => void save()}>
          {busy ? "กำลังนำเข้า…" : "นำเข้างาน"}
        </button>
      </div>
    </div>
  );
}
