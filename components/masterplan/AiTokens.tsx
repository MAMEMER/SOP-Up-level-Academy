"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { copyText, mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import { thaiDateTime } from "../../lib/masterplan-format.ts";

// /masterplan/ai — my tokens + how to plug them into Claude (custom connector) or any other
// AI (read link). The full token is shown once, right after creating it.

type TokenRow = { hash: string; label: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

function CopyField({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <div className="mp-copyfield">
      <span className="mp-copyfield__label">{label}</span>
      <div className="mp-copyfield__row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button
          type="button"
          className="mp-btn"
          onClick={async () => {
            const ok = await copyText(value);
            setState(ok ? "ok" : "fail");
            window.setTimeout(() => setState("idle"), 2500);
          }}
        >
          {state === "ok" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {state === "ok" ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      {state === "fail" ? <p className="mp-warn">คัดลอกอัตโนมัติไม่ได้ — แตะในช่องแล้วคัดลอกเอง</p> : null}
    </div>
  );
}

export function AiTokens({ memberName, max, tokens }: { memberName: string; max: number; tokens: TokenRow[] }) {
  const router = useRouter();
  const [label, setLabel, clearLabel] = useLocalDraft<string>("mp-token-label", `Claude ของ${memberName}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; label: string } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const active = tokens.filter((t) => !t.revokedAt);
  const revoked = tokens.filter((t) => t.revokedAt).slice(0, 5);
  const full = active.length >= max;

  async function create() {
    setBusy(true);
    setError(null);
    const res = await mpApi<{ token: string; label: string }>("tokens", "POST", { label });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated({ token: res.data.token, label: res.data.label });
    clearLabel();
    router.refresh();
  }

  async function revoke(row: TokenRow) {
    if (!window.confirm(`ยกเลิก "${row.label}"? AI ที่ใช้กุญแจนี้จะเข้าไม่ได้ทันที`)) return;
    const res = await mpApi("tokens", "DELETE", { hash: row.hash });
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  return (
    <>
      <p className="mp-alert">
        <ShieldAlert size={18} aria-hidden="true" /> token = กุญแจเข้าแผนในชื่อคุณ ห้ามแชร์ให้ใคร ถ้าหลุดให้กด &ldquo;ยกเลิก&rdquo; ทันที
      </p>

      {created ? (
        <div className="mp-block mp-created">
          <h2 className="mp-h2">
            <KeyRound size={18} aria-hidden="true" /> กุญแจใหม่: {created.label}
          </h2>
          <p className="mp-sub">คัดลอกเก็บไว้ตอนนี้ — ปิดหน้านี้แล้วจะไม่เห็นอีก (ถ้าลืม สร้างใหม่แล้วยกเลิกอันเก่า)</p>
          <CopyField label="URL สำหรับ Claude (custom connector)" value={`${origin}/api/masterplan/mcp/${created.token}`} />
          <CopyField label="ลิงก์อ่านสำหรับ ChatGPT / Gemini / AI อื่น" value={`${origin}/api/masterplan/read/${created.token}?doc=index`} />
          <div className="mp-actions">
            <button type="button" className="mp-btn mp-btn--quiet" onClick={() => setCreated(null)}>
              เก็บแล้ว ปิดกล่องนี้
            </button>
          </div>
        </div>
      ) : null}

      <div className="mp-block">
        <h2 className="mp-h2">
          กุญแจของฉัน <span className="mp-count">{active.length}/{max}</span>
        </h2>
        {active.length === 0 ? <p className="mp-empty">ยังไม่มีกุญแจ — สร้างอันแรกด้านล่าง</p> : null}
        <ul className="mp-list">
          {active.map((t) => (
            <li key={t.hash} className="mp-token">
              <div className="mp-token__main">
                <p className="mp-token__label mp-ellipsis">{t.label}</p>
                <p className="mp-meta">
                  สร้าง {thaiDateTime(t.createdAt)} · ใช้ล่าสุด {t.lastUsedAt ? thaiDateTime(t.lastUsedAt) : "ยังไม่เคยใช้"}
                </p>
              </div>
              <button type="button" className="mp-tool mp-tool--danger" onClick={() => void revoke(t)}>
                <Trash2 size={15} aria-hidden="true" /> ยกเลิก
              </button>
            </li>
          ))}
        </ul>
        {revoked.length > 0 ? (
          <p className="mp-meta mp-token__revoked">ยกเลิกแล้ว: {revoked.map((t) => t.label).join(", ")}</p>
        ) : null}

        <div className="mp-token__new">
          <label className="mp-field">
            <span>ชื่อกุญแจ (ไว้จำว่าใช้กับอะไร)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={full} />
          </label>
          <button type="button" className="mp-btn mp-btn--primary" disabled={busy || full || !label.trim()} onClick={() => void create()}>
            <Plus size={16} aria-hidden="true" /> {busy ? "กำลังสร้าง…" : "สร้าง token ใหม่"}
          </button>
        </div>
        {full ? <p className="mp-warn">มีครบ {max} อันแล้ว — ยกเลิกอันที่ไม่ใช้ก่อน</p> : null}
        {error ? (
          <p className="mp-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mp-split">
        <div className="mp-block">
          <h2 className="mp-h2">ใช้กับ Claude</h2>
          <ol className="mp-steps">
            <li>เปิด claude.ai (เว็บหรือแอป) → Settings → Connectors</li>
            <li>กด Add custom connector → ตั้งชื่อ &ldquo;Up Level Masterplan&rdquo;</li>
            <li>วาง URL สำหรับ Claude ที่คัดลอกไว้ → Add</li>
            <li>ในแชตใหม่ กดปุ่มเครื่องมือ แล้วเปิด Up Level Masterplan</li>
            <li>พิมพ์ &ldquo;อ่านภาพรวม Masterplan&rdquo; แล้วคุยต่อได้เลย — ข้อเสนอที่ Claude สร้างจะเข้าเป็นร่างของคุณ</li>
          </ol>
        </div>
        <div className="mp-block">
          <h2 className="mp-h2">ใช้กับ ChatGPT / Gemini / AI อื่น</h2>
          <ol className="mp-steps">
            <li>คัดลอก &ldquo;ลิงก์อ่าน&rdquo; ไปวางในแชต แล้วบอกให้เปิดอ่าน</li>
            <li>ลิงก์นี้อ่านได้อย่างเดียว — แสดงรายการเอกสารพร้อมลิงก์ของแต่ละหัวข้อ</li>
            <li>ถ้า AI เปิดลิงก์ไม่ได้ ให้ใช้ปุ่ม &ldquo;คัดลอกให้ AI&rdquo; ในหน้าฉบับกลางแทน</li>
            <li>ข้อเสนอจาก AI เหล่านี้ ให้วางคำตอบที่ &ldquo;วางคำตอบจาก AI&rdquo; เหมือนเดิม</li>
          </ol>
        </div>
      </div>
    </>
  );
}
