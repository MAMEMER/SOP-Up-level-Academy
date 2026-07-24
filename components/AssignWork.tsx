"use client";

import { useEffect, useState } from "react";
import {
  assignWork,
  deleteAssignment,
  fetchAssignmentsForDate,
  markAssignmentDone,
  type WorkAssignment
} from "../lib/work-assignments-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

// Owner "มอบหมายงาน" page. Writes to Firestore work_assignments so the assigned
// staff sees it on their "วันนี้ของฉัน" dashboard immediately (closes the loop the
// old local-JSON assign flow left open). Owner picks staff + date + task.
export function AssignWork({
  branch,
  assignedBy,
  staff,
  defaultDate
}: {
  branch: string;
  assignedBy: string;
  staff: StaffOption[];
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(staff[0] ? [staff[0].code] : []);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [rows, setRows] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchAssignmentsForDate(branch, date));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, date]);

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    if (!title.trim() || selectedCodes.length === 0) return;
    setBusy(true);
    try {
      // One doc per selected staff so each person sees it on their own dashboard.
      // Same createdAt stamp keeps a team-assigned batch grouped/identifiable.
      const createdAtIso = new Date().toISOString();
      for (const staffCode of selectedCodes) {
        await assignWork({
          branch,
          workDate: date,
          staffCode,
          title: title.trim(),
          detail: detail.trim() || undefined,
          assignedBy,
          createdAtIso
        });
      }
      setTitle("");
      setDetail("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(row: WorkAssignment) {
    if (row.status === "done") return;
    await markAssignmentDone(row.id, new Date().toISOString());
    await reload();
  }

  async function remove(id: string) {
    await deleteAssignment(id);
    await reload();
  }

  return (
    <div className="assign-work">
      <section className="assign-work__form soft-card">
        <p className="assign-work__label">มอบหมายงานใหม่</p>
        <div className="assign-work__row">
          <label>
            วันที่
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="assign-work__staff-pick">
          <span className="assign-work__pick-label">พนักงาน (เลือกได้หลายคน = มอบเป็นทีม)</span>
          <div className="assign-work__chips">
            {staff.map((s) => (
              <label key={s.code} className={selectedCodes.includes(s.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
                <input type="checkbox" checked={selectedCodes.includes(s.code)} onChange={() => toggleCode(s.code)} />
                {s.displayName} ({s.employmentType === "full_time" ? "Full" : "Part"})
              </label>
            ))}
          </div>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="งาน เช่น ส่งเสื้อให้ลูกค้าคุณ A" />
        <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
        <button type="button" className="primary-action" onClick={submit} disabled={busy || !title.trim() || selectedCodes.length === 0}>
          มอบหมาย{selectedCodes.length > 1 ? ` (${selectedCodes.length} คน)` : ""}
        </button>
      </section>

      <section className="assign-work__list">
        <p className="assign-work__label">งานของวันที่ {date}</p>
        {loading ? (
          <p className="assign-work__empty">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="assign-work__empty">ยังไม่มีงานมอบหมายวันนี้</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.id} className={`assign-work__item assign-work__item--${row.status}`}>
                <button type="button" className="assign-work__check" onClick={() => toggleDone(row)} aria-label="ทำเสร็จ">
                  {row.status === "done" ? "●" : "○"}
                </button>
                <div className="assign-work__item-main">
                  <strong>{row.title}</strong>
                  <em>
                    {displayNameFor(row.staffCode)}
                    {row.detail ? ` · ${row.detail}` : ""}
                    {row.status === "done" ? " · เสร็จแล้ว" : ""}
                  </em>
                </div>
                <button type="button" className="assign-work__del" onClick={() => remove(row.id)} aria-label="ลบ">
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
