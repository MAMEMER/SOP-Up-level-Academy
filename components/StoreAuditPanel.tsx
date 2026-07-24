"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchStoreAudit, type StoreAuditDoc } from "../lib/shift-schedule-store.ts";

// Store open/close audit — separate from the staff shift table. Sourced from the
// Uplevel Academy store account's StoreHub clock-in/out (store open = earliest login,
// close = latest logout each day). Read-only reference for the owner.
function currentMonth(): string {
  const now = new Date();
  const bkk = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayLabel(workDate: string): string {
  const wd = new Date(`${workDate}T12:00:00+07:00`).getUTCDay();
  return ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][wd];
}

export function StoreAuditPanel({ branch }: { branch: string }) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<StoreAuditDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStoreAudit(branch, month)
      .then((data) => alive && setRows(data))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, month]);

  const monthLabel = useMemo(() => month, [month]);

  return (
    <section className="store-audit">
      <div className="store-audit__head">
        <div>
          <p className="eyebrow">Store audit</p>
          <h3>เปิด–ปิดร้าน (ไอดีร้าน)</h3>
          <p className="store-audit__sub">จากบัญชี Uplevel Academy — แยกจากตารางกะพนักงาน</p>
        </div>
        <input type="month" value={monthLabel} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {loading ? (
        <p className="store-audit__empty">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="store-audit__empty">ยังไม่มีข้อมูล — กด &quot;ดึง clock-in StoreHub&quot; ในตารางกะเพื่อ sync</p>
      ) : (
        <div className="store-audit__grid">
          {rows.map((r) => (
            <div key={r.workDate} className="store-audit__day">
              <span className="store-audit__date">{Number(r.workDate.slice(-2))} {dayLabel(r.workDate)}</span>
              <span className="store-audit__open">เปิด {r.openTime ?? "—"}</span>
              <span className="store-audit__close">ปิด {r.closeTime ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
