"use client";

// เงินเดือนพนักงาน (เจ้าของร้าน): งวดครึ่งเดือน · ประจำ = เงินเดือน÷2 · พาร์ท = วันที่มา × เรท
// − หักตามคะแนน KPI (จากระบบคะแนนเดิม) ± รายการปรับพร้อมเหตุผล. OT ระบบเสนอจากเวลาเข้า-ออก
// แล้วเจ้าของกดยืนยันเองถึงจะนับเงิน. logic อยู่ที่ lib/payroll.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Minus, Plus, Settings2, Undo2 } from "lucide-react";
import {
  ADJUSTMENT_LABEL,
  payrollCsv,
  shiftPeriod,
  type AdjustmentKind,
  type PayLine,
  type PayPeriod
} from "../lib/payroll.ts";

type Report = { period: PayPeriod; today: string; ended: boolean; lines: PayLine[]; totals: { base: number; kpiDeduction: number; adjustments: number; net: number; unconfigured: number }; notes: string[] };

const baht = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ฿`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿`;
const day = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const DRAFT_KEY = "sop-payroll-drafts";

type Draft = { kind: AdjustmentKind; sign: 1 | -1; amount: string; reason: string; hours: string };
const emptyDraft: Draft = { kind: "bonus", sign: 1, amount: "", reason: "", hours: "" };

export function PayrollBoard({ initialPeriod }: { initialPeriod: string }) {
  const [periodId, setPeriodId] = useState(initialPeriod);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // ร่างรายการปรับที่ยังไม่กดบันทึก — เก็บไว้ในเครื่อง ปิดหน้าแล้วเปิดใหม่ไม่หาย
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDrafts(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll?period=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "โหลดไม่สำเร็จ");
      setReport(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(periodId);
    const url = new URL(window.location.href);
    url.searchParams.set("period", periodId);
    window.history.replaceState(null, "", url);
  }, [periodId, load]);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "บันทึกไม่สำเร็จ");
      await load(periodId);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy("");
    }
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([payrollCsv(report.period, report.lines)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-${report.period.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <article className="task-section parcel-board payroll-board">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">เจ้าของร้านเท่านั้น</p>
          <h3>เงินเดือนพนักงาน</h3>
        </div>
        {report ? <span className="status-pill">{report.ended ? "งวดจบแล้ว" : "งวดยังไม่จบ"}</span> : null}
      </div>

      <div className="payroll-board__period">
        <button type="button" aria-label="งวดก่อน" onClick={() => setPeriodId((p) => shiftPeriod(p, -1))}>
          <ChevronLeft size={20} aria-hidden />
        </button>
        <strong>{report?.period.id === periodId ? report.period.label : "กำลังโหลด"}</strong>
        <button type="button" aria-label="งวดถัดไป" onClick={() => setPeriodId((p) => shiftPeriod(p, 1))}>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {report ? (
        <div className="payroll-board__totals">
          <div>
            <span>จ่ายสุทธิรวม</span>
            <b>{baht(report.totals.net)}</b>
          </div>
          <div>
            <span>หักตามคะแนน</span>
            <b>{baht(-report.totals.kpiDeduction)}</b>
          </div>
          <div>
            <span>รายการปรับ</span>
            <b>{signed(report.totals.adjustments)}</b>
          </div>
          <button type="button" className="parcel-board__receive" onClick={download}>
            <Download size={16} aria-hidden />
            ดาวน์โหลด CSV
          </button>
        </div>
      ) : null}

      {report?.notes.map((n) => (
        <p key={n} className="parcel-order__note">
          {n}
        </p>
      ))}
      {report?.totals.unconfigured ? (
        <p className="parcel-board__error">ยังไม่ได้ตั้งค่าจ้าง {report.totals.unconfigured} คน — กด "ตั้งค่าจ้าง" ในการ์ดของคนนั้น</p>
      ) : null}
      {error ? (
        <p className="parcel-board__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !report ? <p className="delivery-board__empty">กำลังคำนวณ…</p> : null}

      <ul className="parcel-board__list">
        {report?.lines.map((line) => (
          <PayCard
            key={line.code}
            line={line}
            periodId={report.period.id}
            busy={busy}
            post={post}
            draft={drafts[line.code] || emptyDraft}
            setDraft={(d) => setDrafts((all) => ({ ...all, [line.code]: d }))}
            clearDraft={() =>
              setDrafts((all) => {
                const next = { ...all };
                delete next[line.code];
                return next;
              })
            }
          />
        ))}
      </ul>
    </article>
  );
}

function PayCard({
  line,
  periodId,
  busy,
  post,
  draft,
  setDraft,
  clearDraft
}: {
  line: PayLine;
  periodId: string;
  busy: string;
  post: (b: Record<string, unknown>, k: string) => Promise<boolean>;
  draft: Draft;
  setDraft: (d: Draft) => void;
  clearDraft: () => void;
}) {
  const [showSettings, setShowSettings] = useState(!line.configured);
  const [showAdd, setShowAdd] = useState(Boolean(draft.amount || draft.reason));
  const [voiding, setVoiding] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const active = useMemo(() => line.adjustments.filter((a) => !a.voided), [line.adjustments]);
  const voided = useMemo(() => line.adjustments.filter((a) => a.voided), [line.adjustments]);

  const saveAdjustment = async () => {
    const amount = Number(draft.amount) * draft.sign;
    const ok = await post(
      { action: "adjust", code: line.code, periodId, kind: draft.kind, amount, reason: draft.reason, hours: draft.kind === "ot" ? draft.hours : undefined },
      `adj-${line.code}`
    );
    if (ok) {
      clearDraft();
      setShowAdd(false);
    }
  };

  return (
    <li className="parcel-order payroll-card">
      <div className="parcel-order__head">
        <div className="parcel-order__title">
          <p className="parcel-order__meta">
            {line.code} · {line.type === "full_time" ? "ประจำ" : "พาร์ทไทม์"} · มา {line.daysWorked} วัน
            {line.daysScheduled ? ` จากกะ ${line.daysScheduled} วัน` : ""}
          </p>
          <strong>{line.name}</strong>
        </div>
        <span className="payroll-card__net">{baht(line.net)}</span>
      </div>

      <dl className="payroll-card__rows">
        <div>
          <dt>{line.type === "full_time" ? "เงินเดือนครึ่งเดือน" : "ค่าแรงตามวันที่มา"}</dt>
          <dd>
            <span>{baht(line.base)}</span>
            <small>{line.baseText}</small>
          </dd>
        </div>
        <div>
          <dt>หักตามคะแนน KPI</dt>
          <dd>
            <span className={line.kpiDeduction ? "is-minus" : ""}>{line.kpiDeduction ? baht(-line.kpiDeduction) : "0 ฿"}</span>
            <small>{line.kpiText}</small>
          </dd>
        </div>
        {active.map((a) => (
          <div key={a.id}>
            <dt>
              {ADJUSTMENT_LABEL[a.kind]}
              {a.hours ? ` ${a.hours} ชม.` : ""}
            </dt>
            <dd>
              <span className={a.amount < 0 ? "is-minus" : "is-plus"}>{signed(a.amount)}</span>
              <small>
                {a.reason} · {a.createdBy.split("@")[0]}
              </small>
              {voiding === a.id ? (
                <span className="payroll-card__void">
                  <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="เหตุผลที่ยกเลิก" aria-label="เหตุผลที่ยกเลิก" autoFocus />
                  <button
                    type="button"
                    className="parcel-board__receive"
                    disabled={busy === `void-${a.id}` || voidReason.trim().length < 3}
                    onClick={async () => {
                      if (await post({ action: "void", id: a.id, reason: voidReason }, `void-${a.id}`)) {
                        setVoiding("");
                        setVoidReason("");
                      }
                    }}
                  >
                    ยืนยันยกเลิก
                  </button>
                  <button type="button" className="parcel-board__receive" onClick={() => setVoiding("")}>
                    ไม่ยกเลิก
                  </button>
                </span>
              ) : (
                <button type="button" className="payroll-card__link" onClick={() => { setVoiding(a.id); setVoidReason(""); }}>
                  <Undo2 size={14} aria-hidden />
                  ยกเลิกรายการนี้
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {line.otSuggestion.hours > 0 ? (
        <div className="payroll-card__ot">
          <Clock size={16} aria-hidden />
          <span>
            ระบบเห็นทำเกินกะ {line.otSuggestion.hours} ชม. ({line.otSuggestion.days.map((d) => `${day(d.date)} ${d.hours} ชม.`).join(", ")}) ≈{" "}
            {baht(line.otSuggestion.amount)} (ชม.ละ {line.otRate.toLocaleString("th-TH")} ฿)
          </span>
          <button
            type="button"
            className="parcel-board__new"
            disabled={busy === `ot-${line.code}` || !line.otRate}
            onClick={() =>
              void post(
                {
                  action: "adjust",
                  code: line.code,
                  periodId,
                  kind: "ot",
                  amount: line.otSuggestion.amount,
                  hours: line.otSuggestion.hours,
                  reason: `OT ตามเวลาเข้า-ออก ${line.otSuggestion.days.map((d) => `${day(d.date)} ${d.hours} ชม.`).join(", ")}`
                },
                `ot-${line.code}`
              )
            }
          >
            ใส่ OT นี้
          </button>
        </div>
      ) : null}

      {line.warnings.map((w) => (
        <p key={w} className="parcel-order__note">
          {w}
        </p>
      ))}

      <div className="orders-row__actions">
        <button type="button" className="parcel-board__receive" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} aria-hidden />
          ปรับ บวก / ลบ
        </button>
        <button type="button" className="parcel-board__receive" onClick={() => setShowSettings((v) => !v)}>
          <Settings2 size={16} aria-hidden />
          ตั้งค่าจ้าง
        </button>
      </div>

      {showAdd ? (
        <form
          className="payroll-card__form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAdjustment();
          }}
        >
          <div className="payroll-card__sign" role="group" aria-label="เพิ่มหรือหัก">
            <button type="button" aria-pressed={draft.sign === 1} className={draft.sign === 1 ? "delivery-board__filter is-on" : "delivery-board__filter"} onClick={() => setDraft({ ...draft, sign: 1, kind: draft.kind === "deduction" || draft.kind === "advance" ? "bonus" : draft.kind })}>
              <Plus size={14} aria-hidden /> เพิ่มให้
            </button>
            <button type="button" aria-pressed={draft.sign === -1} className={draft.sign === -1 ? "delivery-board__filter is-on" : "delivery-board__filter"} onClick={() => setDraft({ ...draft, sign: -1, kind: draft.kind === "bonus" || draft.kind === "ot" ? "deduction" : draft.kind })}>
              <Minus size={14} aria-hidden /> หัก
            </button>
          </div>
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as AdjustmentKind })} aria-label="ประเภท">
            {(Object.keys(ADJUSTMENT_LABEL) as AdjustmentKind[]).map((k) => (
              <option key={k} value={k}>
                {ADJUSTMENT_LABEL[k]}
              </option>
            ))}
          </select>
          <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="จำนวนเงิน (บาท)" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} aria-label="จำนวนเงิน" required />
          {draft.kind === "ot" ? (
            <input type="number" inputMode="decimal" min="0" step="0.5" placeholder="ชั่วโมง" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} aria-label="ชั่วโมง OT" />
          ) : null}
          <input placeholder="เหตุผล (จำเป็น) เช่น เบิกล่วงหน้า / ทำแก้วแตก / มาช่วยงานอีเวนต์" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} aria-label="เหตุผล" required minLength={3} />
          <button type="submit" className="parcel-board__new" disabled={busy === `adj-${line.code}`}>
            บันทึก {draft.amount ? signed(Number(draft.amount) * draft.sign) : ""}
          </button>
        </form>
      ) : null}

      {showSettings ? <ProfileForm line={line} busy={busy} post={post} onSaved={() => setShowSettings(false)} /> : null}

      <details className="payroll-card__days">
        <summary>วันที่มาทำงาน{line.missedDates.length ? ` · ขาดตอกบัตร ${line.missedDates.length} วัน` : ""}</summary>
        <p>มา: {line.workedDates.map(day).join(", ") || "-"}</p>
        {line.missedDates.length ? <p>มีกะแต่ไม่มีตอกบัตร: {line.missedDates.map(day).join(", ")}</p> : null}
        {line.extraDates.length ? <p>มาโดยไม่มีกะ (มาแทน/มาเพิ่ม): {line.extraDates.map(day).join(", ")}</p> : null}
        {voided.length ? (
          <p>
            รายการที่ยกเลิกแล้ว: {voided.map((a) => `${signed(a.amount)} ${a.reason} (ยกเลิกเพราะ ${a.voidReason || "-"})`).join(" · ")}
          </p>
        ) : null}
      </details>
    </li>
  );
}

function ProfileForm({ line, busy, post, onSaved }: { line: PayLine; busy: string; post: (b: Record<string, unknown>, k: string) => Promise<boolean>; onSaved: () => void }) {
  const [type, setType] = useState(line.type);
  const [salary, setSalary] = useState(line.rates.monthlySalary ? String(line.rates.monthlySalary) : "");
  const [rate, setRate] = useState(line.rates.dailyRate ? String(line.rates.dailyRate) : "");
  const [ot, setOt] = useState(line.rates.otRatePerHour ? String(line.rates.otRatePerHour) : "");
  return (
    <form
      className="payroll-card__form"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await post(
          {
            action: "profile",
            code: line.code,
            type,
            monthlySalary: type === "full_time" ? salary : null,
            dailyRate: type === "part_time" ? rate : null,
            otRatePerHour: ot || null
          },
          `profile-${line.code}`
        );
        if (ok) onSaved();
      }}
    >
      <div className="payroll-card__sign" role="group" aria-label="ประเภทการจ้าง">
        <button type="button" aria-pressed={type === "full_time"} className={type === "full_time" ? "delivery-board__filter is-on" : "delivery-board__filter"} onClick={() => setType("full_time")}>
          ประจำ (รายเดือน)
        </button>
        <button type="button" aria-pressed={type === "part_time"} className={type === "part_time" ? "delivery-board__filter is-on" : "delivery-board__filter"} onClick={() => setType("part_time")}>
          พาร์ทไทม์ (รายวัน)
        </button>
      </div>
      {type === "full_time" ? (
        <input type="number" inputMode="decimal" min="0" placeholder="เงินเดือนต่อเดือน (บาท)" value={salary} onChange={(e) => setSalary(e.target.value)} aria-label="เงินเดือนต่อเดือน" required />
      ) : (
        <input type="number" inputMode="decimal" min="0" placeholder="ค่าแรงต่อวัน (บาท)" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="ค่าแรงต่อวัน" required />
      )}
      <input type="number" inputMode="decimal" min="0" placeholder="ค่า OT ต่อชม. (เว้นว่าง = ฐาน × 1.5)" value={ot} onChange={(e) => setOt(e.target.value)} aria-label="ค่า OT ต่อชั่วโมง" />
      <button type="submit" className="parcel-board__new" disabled={busy === `profile-${line.code}`}>
        บันทึกค่าจ้าง
      </button>
      <small className="parcel-order__meta">ค่าที่บันทึกใช้กับทุกงวด และเก็บประวัติว่าใครแก้เมื่อไร</small>
    </form>
  );
}
