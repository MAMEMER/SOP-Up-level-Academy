"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { displayNameFor } from "../lib/employee-directory.ts";
import { assignRun, fetchRunsForBranch } from "../lib/stock-runs-store.ts";
import {
  defaultPeriodLabel,
  sortStockRunsNewestFirst,
  stockRunStatusClass,
  stockRunStatusLabel,
  type StockRun,
  type StockRunKind
} from "../lib/stock-runs.ts";

type StaffOption = { code: string; displayName: string };

const KIND_OPTIONS: Array<{ value: StockRunKind; label: string }> = [
  { value: "weekly", label: "งานประจำสัปดาห์ · Stock อุปกรณ์ / Sleeve" },
  { value: "monthly", label: "งานประจำเดือน · Stock Single card" }
];

export function StockRunAssign({
  branch,
  staff,
  initialRuns
}: {
  branch: string;
  staff: StaffOption[];
  initialRuns: StockRun[];
}) {
  const [runs, setRuns] = useState<StockRun[]>(sortStockRunsNewestFirst(initialRuns));
  const [kind, setKind] = useState<StockRunKind>("weekly");
  const [staffCode, setStaffCode] = useState(staff[0]?.code || "");
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel("weekly"));
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  function onKindChange(next: StockRunKind) {
    setKind(next);
    setPeriodLabel(defaultPeriodLabel(next));
  }

  async function refresh() {
    try {
      setRuns(sortStockRunsNewestFirst(await fetchRunsForBranch(branch)));
    } catch {
      /* keep current list */
    }
  }

  async function onAssign() {
    if (!staffCode || !periodLabel.trim()) {
      setStatus({ tone: "warning", text: "เลือกพนักงานและระบุรอบงานก่อน" });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await assignRun({ kind, branch, staffCode, periodLabel: periodLabel.trim(), dueDate });
      setStatus({ tone: "success", text: "มอบหมายงานตรวจนับแล้ว" });
      await refresh();
    } catch (err) {
      setStatus({ tone: "warning", text: err instanceof Error ? err.message : "มอบหมายไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  const waiting = useMemo(() => runs.filter((r) => r.status === "submitted"), [runs]);
  const others = useMemo(() => runs.filter((r) => r.status !== "submitted"), [runs]);

  return (
    <>
      <article className="performance-input-panel">
        <div>
          <p className="eyebrow">มอบหมายงานตรวจนับ</p>
          <h3>สร้างงานตรวจนับให้พนักงาน</h3>
        </div>
        <div className="performance-input-form">
          <label>
            ประเภทงาน
            <select value={kind} onChange={(e) => onKindChange(e.target.value as StockRunKind)}>
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            พนักงานที่รับผิดชอบ
            <select value={staffCode} onChange={(e) => setStaffCode(e.target.value)}>
              {staff.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            รอบงาน
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="เช่น 2026-W32 หรือ 2026-08" />
          </label>
          <label>
            กำหนดส่ง
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}
          <button type="button" className="primary-action" onClick={onAssign} disabled={busy}>
            {busy ? "กำลังมอบหมาย…" : "มอบหมายงานตรวจนับ"}
          </button>
        </div>
      </article>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">รอตรวจ</p>
          <h3>งานที่พนักงานส่งมา ({waiting.length})</h3>
        </div>
        {waiting.length ? (
          <div className="stock-check-list">
            {waiting.map((run) => (
              <Link key={run.id} href={`/admin/stock-runs/${encodeURIComponent(run.id)}`} className="stock-check-row stock-run-link">
                <div>
                  <strong>
                    {displayNameFor(run.staffCode)} · รอบ {run.periodLabel}
                  </strong>
                  <small>
                    {KIND_OPTIONS.find((k) => k.value === run.kind)?.label}
                    {run.submittedAt ? ` · ส่ง ${run.submittedAt.slice(0, 16).replace("T", " ")}` : ""}
                  </small>
                </div>
                <span className={`status-pill ${stockRunStatusClass[run.status]}`}>{stockRunStatusLabel[run.status]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="owner-ops__empty">ยังไม่มีงานที่รอตรวจ</p>
        )}
      </section>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">ทั้งหมด</p>
          <h3>งานตรวจนับอื่น ({others.length})</h3>
        </div>
        {others.length ? (
          <div className="stock-check-list">
            {others.map((run) => (
              <Link key={run.id} href={`/admin/stock-runs/${encodeURIComponent(run.id)}`} className="stock-check-row stock-run-link">
                <div>
                  <strong>
                    {displayNameFor(run.staffCode)} · รอบ {run.periodLabel}
                  </strong>
                  <small>{KIND_OPTIONS.find((k) => k.value === run.kind)?.label}</small>
                </div>
                <span className={`status-pill ${stockRunStatusClass[run.status]}`}>{stockRunStatusLabel[run.status]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="owner-ops__empty">ยังไม่มีงานตรวจนับ</p>
        )}
      </section>
    </>
  );
}
