"use client";

import { useEffect, useState } from "react";
import {
  claimHandoff,
  completeHandoff,
  createHandoff,
  fetchOpenHandoffs,
  type WorkHandoff
} from "../lib/work-assignments-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

type StaffOption = { code: string; displayName: string };

// Cross-shift handoff board: a staff member parks a task ("ลูกค้าฝากของ") for the next
// shift, targeted at a specific teammate or open to anyone. Whoever picks it up claims
// it, then marks it done. Everyone on the branch sees the same live board.
export function HandoffBoard({
  staffCode,
  branch,
  workDate,
  staffOptions
}: {
  staffCode: string | null;
  branch: string;
  workDate: string;
  staffOptions: StaffOption[];
}) {
  const [handoffs, setHandoffs] = useState<WorkHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [toStaff, setToStaff] = useState("any");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setHandoffs(await fetchOpenHandoffs(branch));
    } catch {
      setHandoffs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  async function submit() {
    if (!title.trim() || !staffCode) return;
    setBusy(true);
    try {
      await createHandoff({
        branch,
        workDate,
        title: title.trim(),
        detail: detail.trim() || undefined,
        fromStaff: staffCode,
        toStaff,
        createdAtIso: new Date().toISOString()
      });
      setTitle("");
      setDetail("");
      setToStaff("any");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: string) {
    if (!staffCode) return;
    await claimHandoff(id, staffCode, new Date().toISOString());
    await reload();
  }

  async function complete(id: string) {
    await completeHandoff(id, new Date().toISOString());
    await reload();
  }

  return (
    <div className="handoff">
      {staffCode ? (
        <section className="handoff__new soft-card">
          <p className="handoff__label">ส่งต่องานใหม่</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เรื่อง เช่น ลูกค้าฝากเด็คไว้รอเช็ค" />
          <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="รายละเอียด (ไม่ใส่ชื่อ/เบอร์ลูกค้า)" />
          <div className="handoff__row">
            <select value={toStaff} onChange={(e) => setToStaff(e.target.value)}>
              <option value="any">ใครก็ได้กะถัดไป</option>
              {staffOptions.filter((s) => s.code !== staffCode).map((s) => (
                <option key={s.code} value={s.code}>{s.displayName}</option>
              ))}
            </select>
            <button type="button" className="primary-action" onClick={submit} disabled={busy || !title.trim()}>
              ส่งต่อ
            </button>
          </div>
        </section>
      ) : (
        <p className="handoff__note">เฉพาะ staff ที่อยู่ในระบบกะเท่านั้นที่ส่งต่องานได้</p>
      )}

      <section className="handoff__list">
        <p className="handoff__label">งานที่ยังค้าง</p>
        {loading ? (
          <p className="handoff__loading">กำลังโหลด…</p>
        ) : handoffs.length === 0 ? (
          <p className="handoff__empty">ไม่มีงานส่งต่อค้างอยู่</p>
        ) : (
          <ul>
            {handoffs.map((h) => (
              <li key={h.id} className={`handoff__item handoff__item--${h.status}`}>
                <div className="handoff__item-main">
                  <strong>{h.title}</strong>
                  {h.detail ? <p>{h.detail}</p> : null}
                  <small>
                    จาก {displayNameFor(h.fromStaff)} → {h.toStaff === "any" ? "ใครก็ได้" : displayNameFor(h.toStaff)}
                    {h.status === "claimed" && h.claimedBy ? ` · รับโดย ${displayNameFor(h.claimedBy)}` : ""}
                  </small>
                </div>
                {staffCode ? (
                  <div className="handoff__actions">
                    {h.status === "open" ? (
                      <button type="button" onClick={() => claim(h.id)}>รับงาน</button>
                    ) : null}
                    <button type="button" className="handoff__done" onClick={() => complete(h.id)}>เสร็จ</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
