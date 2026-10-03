"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  CASH_DENOMINATIONS,
  SATANG_BUCKET_LABEL,
  closeProblems,
  computeCash,
  type CashInput,
  type PaidOut,
  type SatangBucket
} from "../lib/daily-close.ts";
import type { BranchDay } from "../lib/daily-close-server.ts";

const baht = (value: number) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = {
  initial: BranchDay;
  branchName: string;
  readOnly: boolean;
};

function emptyCash(day: BranchDay): CashInput {
  const prev = day.close?.cash;
  if (prev) return { ...prev, paidOuts: prev.paidOuts.length ? prev.paidOuts : [] };
  const counts: Record<string, number> = {};
  for (const value of CASH_DENOMINATIONS) counts[String(value)] = 0;
  const float = day.suggestedFloat ?? 0;
  return { openingFloat: float, counts, paidOuts: [], floatKept: float };
}

// ฟอร์มปิดยอดของสาขาเดียว: ยอดจาก POS (อ่านอย่างเดียว) → นับเงินสดในลิ้นชัก → ปิดยอด.
// ร่างที่กรอกค้างไว้เก็บในเครื่อง (ปิดแท็บ/แบตหมดไม่หาย) จนกดปิดยอดสำเร็จ
export function DailyCloseForm({ initial, branchName, readOnly }: Props) {
  const draftKey = `sop-daily-close:${initial.branch}:${initial.workDate}`;
  const [day, setDay] = useState(initial);
  const [cash, setCash] = useState<CashInput>(() => emptyCash(initial));
  const [note, setNote] = useState(initial.close?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { cash?: CashInput; note?: string };
      if (draft.cash) setCash(draft.cash);
      if (typeof draft.note === "string") setNote(draft.note);
    } catch {
      // ไม่มีร่าง / อ่านไม่ได้ — ใช้ค่าเริ่มต้น
    }
  }, [draftKey]);

  function update(next: CashInput, nextNote = note) {
    setCash(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify({ cash: next, note: nextNote }));
    } catch {
      // เก็บร่างไม่ได้ก็ยังกรอกต่อได้
    }
  }

  const posCash = day.pos?.cash ?? 0;
  const result = useMemo(() => computeCash(cash, posCash), [cash, posCash]);
  const problems = closeProblems(cash, result, note);

  async function refresh() {
    const res = await fetch(`/api/daily-close?branch=${day.branch}&date=${day.workDate}`, { cache: "no-store" });
    if (res.ok) setDay((await res.json()) as BranchDay);
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/daily-close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "close", branch: day.branch, date: day.workDate, cash, note })
      });
      const data = (await res.json().catch(() => ({}))) as { problems?: string[]; detail?: string; error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: data.problems?.join(" · ") || data.detail || data.error || "ปิดยอดไม่สำเร็จ" });
        return;
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ไม่เป็นไร
      }
      setMessage({ ok: true, text: "ปิดยอดแล้ว — เจ้าของร้านเห็นทันที" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function setCount(value: number, raw: string) {
    update({ ...cash, counts: { ...cash.counts, [String(value)]: Math.max(0, Math.floor(Number(raw) || 0)) } });
  }

  function setPaidOut(index: number, patch: Partial<PaidOut>) {
    update({ ...cash, paidOuts: cash.paidOuts.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  return (
    <div className="close-form">
      <section className="close-card">
        <div className="close-card__head">
          <h3>ยอดจากเครื่อง POS {branchName}</h3>
          <button type="button" className="soft-button" onClick={refresh}>
            <RotateCcw size={16} aria-hidden /> ดึงใหม่
          </button>
        </div>
        {day.pos ? (
          <>
            <dl className="close-lines">
              {Object.entries(day.pos.byMethod).map(([method, amount]) => (
                <div key={method}>
                  <dt>{method === "Cash" ? "เงินสด" : method}</dt>
                  <dd>{baht(amount)}</dd>
                </div>
              ))}
              <div className="close-lines__total">
                <dt>รวม {day.pos.bills} บิล{day.pos.cancelledBills ? ` (ยกเลิก ${day.pos.cancelledBills})` : ""}</dt>
                <dd>{baht(day.pos.total)}</dd>
              </div>
            </dl>
            {day.pos.kshop.total ? (
              <dl className="close-lines close-lines--sub">
                {(["whole", "store", "online"] as SatangBucket[])
                  .filter((bucket) => day.pos!.kshop[bucket] !== 0)
                  .map((bucket) => (
                    <div key={bucket}>
                      <dt>K SHOP · {SATANG_BUCKET_LABEL[bucket]}</dt>
                      <dd>{baht(day.pos!.kshop[bucket])}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            {day.ruleIssues.length ? (
              <div className="close-alert">
                <CircleAlert size={18} aria-hidden />
                <div>
                  <strong>บิล K SHOP ที่เศษสตางค์ไม่ตรงกติกา {day.ruleIssues.length} บิล</strong>
                  <ul>
                    {day.ruleIssues.map((issue) => (
                      <li key={`${issue.invoiceNumber}-${issue.time}-${issue.amount}`}>
                        {issue.time} · {baht(issue.amount)} — {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="close-alert">
            <CircleAlert size={18} aria-hidden /> ดึงยอดจาก POS ไม่ได้: {day.posError}
          </p>
        )}
      </section>

      <section className="close-card">
        <h3>นับเงินสดในลิ้นชัก</h3>
        <label className="close-field">
          <span>เงินทอนตอนเปิดร้าน</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={cash.openingFloat || ""}
            placeholder="0"
            disabled={readOnly}
            onChange={(event) => update({ ...cash, openingFloat: Number(event.target.value) || 0 })}
          />
        </label>
        <div className="close-denoms">
          {CASH_DENOMINATIONS.map((value) => (
            <label key={value}>
              <span>{value >= 20 ? `แบงก์ ${value}` : `เหรียญ ${value}`}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={cash.counts[String(value)] || ""}
                placeholder="0"
                disabled={readOnly}
                onChange={(event) => setCount(value, event.target.value)}
              />
              <small>{baht(value * (cash.counts[String(value)] || 0))}</small>
            </label>
          ))}
        </div>

        <div className="close-paidouts">
          <span>เงินสดที่หยิบจ่ายออกระหว่างวัน</span>
          {cash.paidOuts.map((item, index) => (
            <div key={index} className="close-paidouts__row">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="บาท"
                value={item.amount || ""}
                disabled={readOnly}
                onChange={(event) => setPaidOut(index, { amount: Number(event.target.value) || 0 })}
              />
              <input
                type="text"
                placeholder="จ่ายค่าอะไร เช่น น้ำแข็ง"
                value={item.note}
                disabled={readOnly}
                onChange={(event) => setPaidOut(index, { note: event.target.value })}
              />
              <button
                type="button"
                className="close-icon-button"
                aria-label="ลบรายการ"
                disabled={readOnly}
                onClick={() => update({ ...cash, paidOuts: cash.paidOuts.filter((_, i) => i !== index) })}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="soft-button"
            disabled={readOnly}
            onClick={() => update({ ...cash, paidOuts: [...cash.paidOuts, { amount: 0, note: "" }] })}
          >
            <Plus size={16} aria-hidden /> เพิ่มรายการจ่ายออก
          </button>
        </div>

        <dl className="close-lines">
          <div>
            <dt>เงินทอนตั้งต้น + ขายเงินสด − จ่ายออก</dt>
            <dd>{baht(result.expected)}</dd>
          </div>
          <div>
            <dt>นับได้จริง</dt>
            <dd>{baht(result.counted)}</dd>
          </div>
          <div className={`close-lines__total ${result.diff === 0 ? "is-ok" : "is-bad"}`}>
            <dt>{result.diff === 0 ? "เงินสดตรง" : result.diff > 0 ? "เงินสดเกิน" : "เงินสดขาด"}</dt>
            <dd>{baht(result.diff)}</dd>
          </div>
        </dl>

        <label className="close-field">
          <span>เก็บเงินทอนไว้ในลิ้นชักสำหรับพรุ่งนี้</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={cash.floatKept || ""}
            placeholder="0"
            disabled={readOnly}
            onChange={(event) => update({ ...cash, floatKept: Number(event.target.value) || 0 })}
          />
        </label>
        <p className="close-handover">
          เงินสดที่ต้องนำส่ง <strong>{baht(result.handover)}</strong> บาท
        </p>

        <label className="close-field">
          <span>หมายเหตุ{result.diff !== 0 ? " (ต้องเขียน — เงินสดไม่ตรง)" : ""}</span>
          <textarea
            rows={3}
            value={note}
            disabled={readOnly}
            onChange={(event) => {
              setNote(event.target.value);
              update(cash, event.target.value);
            }}
          />
        </label>
      </section>

      {problems.length ? (
        <ul className="close-problems">
          {problems.map((problem) => (
            <li key={problem}>
              <CircleAlert size={16} aria-hidden /> {problem}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className={message.ok ? "close-message is-ok" : "close-message is-bad"}>
          {message.ok ? <CircleCheck size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />} {message.text}
        </p>
      ) : null}
      <button
        type="button"
        className="primary-action close-submit"
        disabled={readOnly || busy || !day.pos || problems.length > 0}
        onClick={submit}
      >
        {busy ? "กำลังบันทึก…" : day.close ? "ปิดยอดใหม่ (เก็บฉบับเดิมไว้ในประวัติ)" : "ปิดยอด"}
      </button>
      {day.close ? (
        <p className="close-meta">
          ปิดล่าสุดโดย {day.close.closedByName || day.close.closedBy} ·{" "}
          {new Date(day.close.closedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
          {day.close.history?.length ? ` · ปิดซ้ำ ${day.close.history.length} ครั้ง` : ""}
        </p>
      ) : null}
    </div>
  );
}
