"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, ClipboardPaste, Copy, Check, TriangleAlert } from "lucide-react";
import {
  AI_COPY_SOFT_LIMIT,
  buildAiContext,
  parseAiReply,
  type MpProposal,
  type ParsedAiProposal
} from "../../lib/masterplan.ts";
import { copyText, mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";

// "คัดลอกให้ AI" + "วางคำตอบจาก AI" — works with any chat AI (Claude, ChatGPT, Gemini, Grok)
// by copy/paste only. Copy builds one block (instructions + content + reply format); paste
// leniently parses the JSON reply into preview cards; ticked ones become ร่าง under the
// signed-in member.

export type AiSection = { index: number; heading: string; text: string };

export function AiPanel({
  memberName,
  memberKey,
  docTitle,
  docText,
  sections = [],
  scratch,
  openProposals = [],
  defaults = { doc: true, scratch: true, proposals: true }
}: {
  memberName: string;
  memberKey: string;
  docTitle?: string;
  docText?: string;
  sections?: AiSection[];
  scratch?: string;
  openProposals?: Pick<MpProposal, "code" | "title" | "status" | "location" | "kind" | "newText">[];
  defaults?: { doc: boolean; scratch: boolean; proposals: boolean };
}) {
  const router = useRouter();
  const [includeDoc, setIncludeDoc] = useState(defaults.doc && Boolean(docText));
  const [includeScratch, setIncludeScratch] = useState(defaults.scratch && Boolean(scratch?.trim()));
  const [includeProposals, setIncludeProposals] = useState(defaults.proposals && openProposals.length > 0);
  const [scope, setScope] = useState<string>("all");
  const [copied, setCopied] = useState<"ok" | null>(null);
  const [manual, setManual] = useState(false);
  const [reply, setReply, clearReply] = useLocalDraft<string>(`mp-ai-reply-${memberKey}`, "");
  const [parsed, setParsed] = useState<ParsedAiProposal[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const section = scope === "all" ? null : sections.find((s) => String(s.index) === scope) ?? null;
  const block = useMemo(
    () =>
      buildAiContext({
        memberName,
        scopeLabel: section ? `เฉพาะหัวข้อ "${section.heading}" ของ${docTitle || "ฉบับกลาง"}` : includeDoc ? `ทั้ง${docTitle || "ฉบับกลาง"}` : "กระดาษทดและข้อเสนอของฉัน",
        docTitle,
        docText: includeDoc ? (section ? section.text : docText) : undefined,
        scratch: includeScratch ? scratch : undefined,
        openProposals: includeProposals ? openProposals : undefined
      }),
    [memberName, section, includeDoc, docTitle, docText, includeScratch, scratch, includeProposals, openProposals]
  );
  const tooBig = block.length > AI_COPY_SOFT_LIMIT;

  async function copy() {
    const ok = await copyText(block);
    setManual(!ok);
    if (!ok) return;
    setCopied("ok");
    window.setTimeout(() => setCopied(null), 2500);
  }

  function parse() {
    setResult(null);
    const out = parseAiReply(reply);
    if (!out.ok) {
      setParsed(null);
      setParseError(out.error);
      return;
    }
    setParseError(null);
    setParsed(out.value);
    setPicked(out.value.map((item) => item.valid));
  }

  async function createSelected() {
    if (!parsed) return;
    const items = parsed.filter((item, i) => picked[i] && item.valid).map(({ valid: _v, error: _e, ...draft }) => draft);
    if (items.length === 0) return;
    setBusy(true);
    const res = await mpApi<{ created: { code: string }[] }>("proposals", "POST", { items });
    setBusy(false);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setResult(`สร้างร่างแล้ว ${res.data.created.map((c) => c.code).join(", ")} — ไปตรวจและกด "ส่งเข้าวาระ" ที่หน้าข้อเสนอ`);
    setParsed(null);
    clearReply();
    router.refresh();
  }

  return (
    <div className="mp-ai">
      <div className="mp-ai__head">
        <h2 className="mp-h2">ให้ AI ช่วยคิด</h2>
        <details className="mp-help">
          <summary aria-label="วิธีใช้">
            <CircleHelp size={18} aria-hidden="true" /> วิธีใช้
          </summary>
          <ol>
            <li>กด &ldquo;คัดลอกให้ AI&rdquo; — ได้ข้อความก้อนเดียวที่มีคำสั่ง เนื้อหา และรูปแบบคำตอบ</li>
            <li>เปิด AI ที่ใช้อยู่ (Claude, ChatGPT, Gemini, Grok) วางข้อความ แล้วพิมพ์ต่อว่าอยากให้ช่วยเรื่องอะไร</li>
            <li>คุยกับ AI จนพอใจ ให้มันตอบปิดท้ายด้วยบล็อก ```json</li>
            <li>คัดลอกคำตอบทั้งหมดมาวางในช่อง &ldquo;วางคำตอบจาก AI&rdquo; แล้วกด &ldquo;อ่านคำตอบ&rdquo;</li>
            <li>ติ๊กข้อที่ใช่ → ได้เป็น &ldquo;ร่าง&rdquo; ของเรา ตรวจแล้วค่อยส่งเข้าวาระคุยวันถัดไป</li>
          </ol>
        </details>
      </div>

      <div className="mp-ai__opts" role="group" aria-label="เลือกสิ่งที่จะส่งให้ AI">
        {docText ? (
          <label className="mp-check">
            <input type="checkbox" checked={includeDoc} onChange={(e) => setIncludeDoc(e.target.checked)} /> {docTitle || "ฉบับกลาง"}
          </label>
        ) : null}
        {scratch !== undefined ? (
          <label className="mp-check">
            <input type="checkbox" checked={includeScratch} onChange={(e) => setIncludeScratch(e.target.checked)} /> กระดาษทดของฉัน
          </label>
        ) : null}
        {openProposals.length > 0 ? (
          <label className="mp-check">
            <input type="checkbox" checked={includeProposals} onChange={(e) => setIncludeProposals(e.target.checked)} /> ข้อเสนอที่เปิดอยู่ ({openProposals.length})
          </label>
        ) : null}
      </div>
      {includeDoc && sections.length > 0 ? (
        <label className="mp-field mp-ai__scope">
          <span>ขอบเขต</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">ทั้งฉบับ</option>
            {sections.map((s) => (
              <option key={s.index} value={String(s.index)}>
                เฉพาะหัวข้อ: {s.heading}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" onClick={() => void copy()}>
          {copied === "ok" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === "ok" ? "คัดลอกแล้ว" : "คัดลอกให้ AI"}
        </button>
        <span className="mp-meta">{block.length.toLocaleString("th-TH")} ตัวอักษร</span>
      </div>
      {manual ? (
        <label className="mp-field">
          <span className="mp-warn">เบราว์เซอร์ไม่ให้คัดลอกอัตโนมัติ — เลือกข้อความทั้งหมดในช่องนี้แล้วคัดลอกเอง</span>
          <textarea className="mp-textarea" rows={6} readOnly value={block} onFocus={(e) => e.currentTarget.select()} autoFocus />
        </label>
      ) : null}
      {tooBig ? (
        <p className="mp-warn">
          <TriangleAlert size={16} aria-hidden="true" /> ยาวเกิน {AI_COPY_SOFT_LIMIT.toLocaleString("th-TH")} ตัวอักษร AI บางตัวรับไม่ไหว
          {sections.length > 0 && includeDoc ? " — เลือก \"เฉพาะหัวข้อ\" ในช่องขอบเขตด้านบน เพื่อคัดลอกเฉพาะหัวข้อนี้" : ""}
        </p>
      ) : null}

      <label className="mp-field" htmlFor={`mp-ai-reply-${memberKey}`}>
        <span>วางคำตอบจาก AI</span>
        <textarea
          id={`mp-ai-reply-${memberKey}`}
          className="mp-textarea"
          rows={5}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="วางคำตอบทั้งหมดของ AI ตรงนี้ (มีข้อความอื่นปนได้ ขอให้มีบล็อก json)"
        />
      </label>
      <div className="mp-actions">
        <button type="button" className="mp-btn" onClick={parse} disabled={!reply.trim()}>
          <ClipboardPaste size={16} aria-hidden="true" /> อ่านคำตอบ
        </button>
      </div>
      {parseError ? (
        <p className="mp-error" role="alert">
          {parseError}
        </p>
      ) : null}
      {result ? (
        <p className="mp-ok" role="status">
          {result}
        </p>
      ) : null}

      {parsed ? (
        <div className="mp-ai__preview">
          <p className="mp-meta">พบ {parsed.length} ข้อเสนอ — ติ๊กข้อที่จะเก็บเป็นร่าง</p>
          <ul className="mp-list">
            {parsed.map((item, i) => (
              <li key={i} className={`mp-ai__item${item.valid ? "" : " is-invalid"}`}>
                <label className="mp-check mp-check--top">
                  <input
                    type="checkbox"
                    checked={Boolean(picked[i])}
                    disabled={!item.valid}
                    onChange={(e) => setPicked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span>
                    <strong className="mp-ellipsis">{item.title}</strong>
                    <span className="mp-meta">
                      {item.kind} · {item.missions.join(", ") || "-"}
                      {item.location ? ` · ${item.location}` : ""}
                    </span>
                  </span>
                </label>
                {item.error ? <p className="mp-error">{item.error}</p> : null}
                <Diff oldText={item.oldText} newText={item.newText} />
                {item.reason ? <p className="mp-reason">เหตุผล: {item.reason}</p> : null}
              </li>
            ))}
          </ul>
          <div className="mp-actions">
            <button type="button" className="mp-btn mp-btn--primary" disabled={busy || !picked.some(Boolean)} onClick={() => void createSelected()}>
              {busy ? "กำลังสร้าง…" : `สร้างเป็นร่าง (${picked.filter(Boolean).length})`}
            </button>
            <button type="button" className="mp-btn mp-btn--quiet" onClick={() => setParsed(null)}>
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Diff({ oldText, newText }: { oldText: string; newText: string }) {
  const long = oldText.length + newText.length > 700;
  const [open, setOpen] = useState(false);
  if (!oldText.trim() && !newText.trim()) return null;
  return (
    <div className={`mp-diff${long && !open ? " is-clamped" : ""}`}>
      {oldText.trim() ? (
        <div className="mp-diff__old">
          <span className="mp-diff__label">เดิม</span>
          <p>{oldText}</p>
        </div>
      ) : null}
      {newText.trim() ? (
        <div className="mp-diff__new">
          <span className="mp-diff__label">เสนอ</span>
          <p>{newText}</p>
        </div>
      ) : null}
      {long ? (
        <button type="button" className="mp-linkbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "ย่อ" : "ดูข้อความทั้งหมด"}
        </button>
      ) : null}
    </div>
  );
}
