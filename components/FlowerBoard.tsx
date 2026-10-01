import Link from "next/link";
import { Trophy } from "lucide-react";
import { bloomLabel } from "../lib/flower-garden.ts";
import type { LeaderRow } from "../lib/flower-target.ts";

// อันดับดอกไม้ของเดือนเดียว — ใช้ทั้งหน้าดอกไม้ย้อนหลังของทุกคนและหน้าเจ้าของ
// มีแค่ชื่อพนักงานกับจำนวนกลีบ: ไม่มีตัวตนลูกค้า ไม่มียอดขายเป็นบาท

export function FlowerBoard({
  rows,
  targetPetals,
  highlightCode,
  hrefFor
}: {
  rows: LeaderRow[];
  targetPetals: number;
  /** แถวของคนที่เปิดดูอยู่ — ให้หาตัวเองเจอเร็ว */
  highlightCode?: string | null;
  /** กดชื่อแล้วไปดูสวนดอกไม้ของคนนั้น (เฉพาะหัวหน้า) */
  hrefFor?: (staffCode: string) => string;
}) {
  return (
    <ul className="flower-target-board">
      {rows.map((row) => {
        const pct = targetPetals > 0 ? Math.round((row.netPetals / targetPetals) * 100) : null;
        const classes = [pct !== null && pct < 100 ? "is-below" : "", row.staffCode === highlightCode ? "is-me" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={row.staffCode} className={classes || undefined}>
            <span className="flower-target-rank">
              {row.rank === 1 && row.netPetals > 0 ? <Trophy aria-label="อันดับ 1" size={18} /> : row.rank}
            </span>
            <span className="flower-target-name">
              {hrefFor ? <Link href={hrefFor(row.staffCode)}>{row.name}</Link> : row.name}
            </span>
            <span className="flower-target-bar" aria-hidden>
              <i style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
            </span>
            <span className="flower-target-value">
              {bloomLabel(row.netPetals)}
              <small>{pct === null ? "—" : `${pct}%`}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
