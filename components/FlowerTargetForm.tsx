"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { bloomLabel } from "../lib/flower-garden.ts";
import { targetPetalsPerPerson } from "../lib/flower-target.ts";
import type { FlowerMonth } from "../lib/flower-target-server.ts";

// ฟอร์มตั้งเป้าดอกไม้ — ตัวเลขด้านล่างคำนวณใหม่ทันทีที่พิมพ์ ให้เห็นก่อนกดบันทึกว่าเป้าจะเป็นเท่าไหร่

const thaiDate = (ymd: string) =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${ymd}T12:00:00+07:00`));
const baht = (n: number) => `${Math.round(n).toLocaleString("th-TH")} ฿`;

export function FlowerTargetForm({ initial }: { initial: FlowerMonth }) {
  const [data, setData] = useState(initial);
  const [percent, setPercent] = useState(String(initial.settings.minPercentOfSales));
  const [prize, setPrize] = useState(initial.settings.prize);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const pctNumber = Number(percent);
  const valid = percent.trim() !== "" && Number.isFinite(pctNumber) && pctNumber >= 0 && pctNumber <= 100;
  const target = valid ? targetPetalsPerPerson(data.potentialPetals, pctNumber) : data.targetPetals;
  const dirty = pctNumber !== data.settings.minPercentOfSales || prize.trim() !== data.settings.prize;
  const top = data.leaderboard[0];

  const rows = useMemo(
    () => data.leaderboard.map((row) => ({ ...row, pct: target > 0 ? Math.round((row.netPetals / target) * 100) : null })),
    [data.leaderboard, target]
  );

  async function save() {
    if (!valid) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/flowers/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minPercentOfSales: pctNumber, prize, startDate: data.settings.startDate })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as FlowerMonth;
      setData(next);
      setPercent(String(next.settings.minPercentOfSales));
      setPrize(next.settings.prize);
      setStatus({ tone: "ok", text: "บันทึกแล้ว — หน้าพนักงานเห็นเป้าใหม่ทันที" });
    } catch (cause) {
      setStatus({ tone: "error", text: `บันทึกไม่สำเร็จ — ${String(cause)}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sdoc-form flower-target">
      <section className="sdoc-section">
        <p className="eyebrow">กติกา</p>
        <label className="sdoc-field">
          <span className="sdoc-label">แต่ละคนต้องได้ดอกไม้อย่างน้อยกี่ % ของยอดขายในเดือน</span>
          <div className="flower-target-percent">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              aria-invalid={!valid}
            />
            <span>%</span>
          </div>
          <span className="sdoc-hint">
            ยอดขาย 10 ฿ = ลูกค้าให้ได้ 1 กลีบ · นับตั้งแต่ {thaiDate(data.settings.startDate)} ที่เริ่มมีระบบดอกไม้ ตัดรอบทุกสิ้นเดือน
          </span>
          {!valid ? <span className="sdoc-error">ใส่ตัวเลข 0–100</span> : null}
        </label>

        <label className="sdoc-field">
          <span className="sdoc-label">รางวัลพิเศษของคนที่ได้ดอกไม้มากที่สุด <span className="sdoc-opt">(ไม่บังคับ)</span></span>
          <input
            type="text"
            maxLength={120}
            placeholder="เช่น บัตรกำนัล 500 ฿ / วันหยุดพิเศษ 1 วัน"
            value={prize}
            onChange={(event) => setPrize(event.target.value)}
          />
          <span className="sdoc-hint">เว้นว่างไว้ พนักงานจะเห็นแค่ &ldquo;มีรางวัลพิเศษ&rdquo;</span>
        </label>

        <div className="sdoc-toolbar">
          <span className="sdoc-saved">
            {status ? <span className={status.tone === "error" ? "sdoc-error" : undefined}>{status.text}</span>
              : data.settings.updatedAt ? `แก้ล่าสุด ${new Date(data.settings.updatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ยังเป็นค่าเริ่มต้น"}
          </span>
          <button type="button" className="primary-action" onClick={save} disabled={!valid || !dirty || saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">เดือนนี้ ({data.month})</p>
        <div className="flower-target-stats">
          <div><small>ยอดขายที่นับเข้าเป้า</small><strong>{baht(data.salesBaht)}</strong></div>
          <div><small>เป้าต่อคน</small><strong>{bloomLabel(target)}</strong><small>{target} กลีบ = {baht(target * 10)}</small></div>
        </div>

        <ul className="flower-target-board">
          {rows.map((row) => (
            <li key={row.staffCode} className={row.pct !== null && row.pct < 100 ? "is-below" : undefined}>
              <span className="flower-target-rank">
                {row.rank === 1 && row.netPetals > 0 ? <Trophy aria-label="อันดับ 1" size={18} /> : row.rank}
              </span>
              <span className="flower-target-name">{row.name}</span>
              <span className="flower-target-bar" aria-hidden>
                <i style={{ width: `${Math.min(100, row.pct ?? 0)}%` }} />
              </span>
              <span className="flower-target-value">
                {bloomLabel(row.netPetals)}
                <small>{row.pct === null ? "—" : `${row.pct}%`}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className="sdoc-hint">
          {top && top.netPetals > 0 ? `ตอนนี้ ${top.name} นำอยู่` : "ยังไม่มีใครได้ดอกไม้เดือนนี้"} · ใบไม้แห้งหักล้างกับดอกไม้แล้ว ·
          ใครต่ำกว่าเป้าจะเห็นแถบเตือนบนหน้าหลักของตัวเองทุกวัน ไม่มีการหักคะแนน
        </p>
      </section>
    </div>
  );
}
