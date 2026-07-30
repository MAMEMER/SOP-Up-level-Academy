"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadMonthPlan } from "../lib/shift-schedule-store.ts";
import { isWorkingAssignment } from "../lib/shift-schedule.ts";
import {
  DEFAULT_REORDER_THRESHOLD_THB,
  buildReorderDetail,
  buildReorderTitle,
  parseSupplyNeedsCsv,
  summariseReorder
} from "../lib/supply-needs-reorder.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

export type AssignReorderResult = { ok: boolean; message: string };

// Owner "แจ้งเตือนสั่งซื้อ (Supply Needs)" page. StoreHub has no supply-needs API, so the
// owner copies the "ความต้องการเติมสต็อก" list from
//   https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web
// and pastes it here. The page sums the cost live; when it reaches ฿1,000 it turns the
// paste into a KPI-scored assigned task (sop_assigned_records) for the on-shift staff,
// which shows on their "วันนี้ของฉัน" dashboard immediately (ticket aFa09TOnAQDYzs850k5D).
export function ReorderAlert({
  branch,
  staff,
  defaultDate,
  assignReorderAction
}: {
  branch: string;
  staff: StaffOption[];
  defaultDate: string;
  assignReorderAction: (payload: {
    csvText: string;
    workDate: string;
    staffCodes: string[];
    force: boolean;
  }) => Promise<AssignReorderResult>;
}) {
  const [date, setDate] = useState(defaultDate);
  const [csvText, setCsvText] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [onShiftCodes, setOnShiftCodes] = useState<string[] | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssignReorderResult | null>(null);

  const summary = useMemo(() => summariseReorder(parseSupplyNeedsCsv(csvText)), [csvText]);

  // Pre-select whoever is on shift (s1/s2) for the chosen date — "แจ้งเตือนพนักงานตามกะ".
  useEffect(() => {
    let alive = true;
    setOnShiftCodes(null);
    loadMonthPlan(branch, date.slice(0, 7))
      .then((plan) => {
        if (!alive) return;
        const working = plan.plans
          .filter((p) => p.workDate === date && isWorkingAssignment(p.assignment))
          .map((p) => p.staffCode);
        setOnShiftCodes(working);
        // Only auto-fill the selection the first time / when it hasn't been touched.
        setSelectedCodes((prev) => (prev.length === 0 ? working : prev));
      })
      .catch(() => alive && setOnShiftCodes([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, date]);

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const canAssign = (summary.reached || force) && selectedCodes.length > 0 && !busy;

  async function submit() {
    if (!canAssign) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await assignReorderAction({ csvText, workDate: date, staffCodes: selectedCodes, force });
      setResult(res);
    } catch {
      setResult({ ok: false, message: "มอบหมายไม่สำเร็จ — ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  const previewTitle = summary.itemCount ? buildReorderTitle(summary) : "";
  const previewDetail = summary.itemCount ? buildReorderDetail(summary) : "";

  return (
    <div className="assign-work">
      <section className="assign-work__form soft-card">
        <p className="assign-work__label">1 · วางรายการ &quot;ความต้องการเติมสต็อก&quot; จาก StoreHub</p>
        <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.75 }}>
          เปิด{" "}
          <a href="https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web" target="_blank" rel="noreferrer">
            StoreHub → Supply Needs
          </a>{" "}
          → export/คัดลอกตาราง แล้ววางด้านล่าง (รองรับ CSV และคัดลอกจากตารางแบบ Tab)
        </p>
        <div className="assign-work__row">
          <label>
            วันที่มอบหมาย
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <textarea
          className="assign-work__detail"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={"วางข้อมูลที่นี่ เช่น:\nProduct,Supplier,Order Qty,Cost\nBooster Box A,Pokemon,3,540\nSleeve B,Dragon Shield,10,650"}
          rows={8}
          spellCheck={false}
        />

        <div
          className={`soft-card`}
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderLeft: `4px solid ${summary.reached ? "#16a34a" : summary.itemCount ? "#d97706" : "#cbd5e1"}`
          }}
        >
          <p className="assign-work__label" style={{ marginBottom: 6 }}>
            2 · สรุปยอด
          </p>
          {summary.itemCount === 0 ? (
            <p style={{ margin: 0, opacity: 0.7 }}>ยังไม่มีข้อมูล — วางรายการด้านบนก่อน</p>
          ) : (
            <>
              <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>
                ยอดต้นทุนรวม ฿{summary.totalCost.toLocaleString()} · {summary.itemCount} รายการ
              </p>
              <p style={{ margin: 0, color: summary.reached ? "#16a34a" : "#d97706", fontWeight: 600 }}>
                {summary.reached
                  ? `✅ ถึงเกณฑ์แจ้งเตือน (฿${summary.threshold.toLocaleString()}) — มอบหมายงานสั่งซื้อได้`
                  : `ยังไม่ถึงเกณฑ์ ฿${summary.threshold.toLocaleString()} (ขาดอีก ฿${(summary.threshold - summary.totalCost).toLocaleString()})`}
              </p>
            </>
          )}
        </div>

        <div className="assign-work__staff-pick" style={{ marginTop: 12 }}>
          <span className="assign-work__pick-label">
            3 · พนักงานที่จะมอบหมาย (ติ๊กไว้ = พนักงานตามกะวันนี้
            {onShiftCodes === null ? " · กำลังโหลด…" : onShiftCodes.length === 0 ? " · ไม่พบกะวันนี้ เลือกเอง" : ""})
          </span>
          <div className="assign-work__chips">
            {staff.map((s) => {
              const onShift = onShiftCodes?.includes(s.code);
              return (
                <label key={s.code} className={selectedCodes.includes(s.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
                  <input type="checkbox" checked={selectedCodes.includes(s.code)} onChange={() => toggleCode(s.code)} />
                  {s.displayName}
                  {onShift ? " · ตามกะ" : ""}
                </label>
              );
            })}
          </div>
        </div>

        {!summary.reached && summary.itemCount > 0 ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            มอบหมายแม้ยอดยังไม่ถึงเกณฑ์ (override)
          </label>
        ) : null}

        <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.7 }}>
          ⚠️ งานนี้เป็น <strong>KPI</strong> — พนักงานที่ได้รับมอบหมายต้องเข้าไปกด &quot;ส่งงาน&quot; พร้อมหลักฐานการสั่งซื้อ
          ก่อนสิ้นวัน ไม่งั้นถือว่างานไม่เสร็จ (มีผลหักคะแนน)
        </p>

        <button
          type="button"
          className="primary-action"
          style={{ marginTop: 12 }}
          onClick={submit}
          disabled={!canAssign}
        >
          {busy ? "กำลังมอบหมาย…" : `มอบหมายงานสั่งซื้อ${selectedCodes.length ? ` (${selectedCodes.length} คน)` : ""}`}
        </button>

        {result ? (
          <p
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: result.ok ? "#dcfce7" : "#fee2e2",
              color: result.ok ? "#166534" : "#991b1b",
              fontWeight: 600
            }}
          >
            {result.message}
            {result.ok ? (
              <>
                {" "}
                <Link href="/admin/performance-score">ดูใน Performance →</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {previewTitle ? (
        <section className="assign-work__list">
          <p className="assign-work__label">ตัวอย่างงานที่พนักงานจะเห็น</p>
          <div className="soft-card" style={{ padding: "12px 14px" }}>
            <strong>{previewTitle}</strong>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: "8px 0 0" }}>{previewDetail}</pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}
