"use client";

import { useEffect, useMemo, useState } from "react";
import { cardStoreWorkflow, phasesForShift } from "../lib/card-store-workflow.ts";
import { applyChecklistOverrides, type ChecklistOverrides } from "../lib/daily-checklist.ts";
import { fetchChecklistOverrides } from "../lib/daily-checklist-store.ts";
import { shiftEndTime, shiftLabel, type ShiftCode } from "../lib/shift-schedule.ts";
import { fetchShiftForStaffDate, type PlanDoc } from "../lib/shift-schedule-store.ts";
import {
  fetchAssignmentsForDate,
  fetchOpenHandoffs,
  handoffsForStaff,
  type WorkAssignment,
  type WorkHandoff
} from "../lib/work-assignments-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

// Owner review page: pick a staff member + date and see their day the way they see it —
// shift, the routine checklist they were meant to run, assigned tasks (with done state),
// and handoffs. Read-only; the owner uses it to review work at a glance.
export function StaffReviewView({
  branch,
  staff,
  defaultDate
}: {
  branch: string;
  staff: StaffOption[];
  defaultDate: string;
}) {
  const [staffCode, setStaffCode] = useState(staff[0]?.code ?? "");
  const [date, setDate] = useState(defaultDate);
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [handoffs, setHandoffs] = useState<WorkHandoff[]>([]);
  const [overrides, setOverrides] = useState<ChecklistOverrides>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffCode) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchShiftForStaffDate(branch, date, staffCode),
      fetchAssignmentsForDate(branch, date),
      fetchOpenHandoffs(branch),
      fetchChecklistOverrides(branch)
    ])
      .then(([planDoc, allAssignments, allHandoffs, ov]) => {
        if (!alive) return;
        setPlan(planDoc);
        setAssignments(allAssignments.filter((a) => a.staffCode === staffCode));
        setHandoffs(handoffsForStaff(allHandoffs, staffCode));
        setOverrides(ov);
      })
      .catch(() => {
        if (!alive) return;
        setPlan(null);
        setAssignments([]);
        setHandoffs([]);
        setOverrides({});
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, date, staffCode]);

  const assignment = plan?.assignment;
  const shift = assignment === "s1" || assignment === "s2" ? (assignment as ShiftCode) : null;

  const routine = useMemo(() => {
    if (!shift) return [];
    return applyChecklistOverrides(phasesForShift(cardStoreWorkflow, shift), overrides);
  }, [shift, overrides]);

  const doneCount = assignments.filter((a) => a.status === "done").length;

  return (
    <div className="staff-review">
      <div className="staff-review__controls">
        <label>
          พนักงาน
          <select value={staffCode} onChange={(e) => setStaffCode(e.target.value)}>
            {staff.map((s) => (
              <option key={s.code} value={s.code}>
                {s.displayName} ({s.employmentType === "full_time" ? "Full" : "Part"})
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="staff-review__loading">กำลังโหลด…</p>
      ) : (
        <div className="staff-review__body">
          <article className={`staff-review__card${shift ? " staff-review__card--work" : ""}`}>
            <p className="staff-review__label">กะ</p>
            {shift ? (
              <>
                <strong>{shiftLabel(shift)}</strong>
                <p className="staff-review__muted">เข้า {plan?.startTime} · ออก {shiftEndTime(plan?.startTime ?? "")}</p>
              </>
            ) : assignment === "leave_personal" || assignment === "leave_sick" ? (
              <strong>{assignment === "leave_sick" ? "ลาป่วย" : "ลากิจ"}</strong>
            ) : (
              <strong className="staff-review__muted">ไม่ได้เข้ากะวันนี้</strong>
            )}
          </article>

          <article className="staff-review__card">
            <p className="staff-review__label">งานที่มอบหมาย · เสร็จ {doneCount}/{assignments.length}</p>
            {assignments.length === 0 ? (
              <p className="staff-review__muted">ไม่มี</p>
            ) : (
              <ul className="staff-review__list">
                {assignments.map((a) => (
                  <li key={a.id} className={a.status === "done" ? "is-done" : ""}>
                    <span>{a.status === "done" ? "●" : "○"}</span>
                    <div>
                      <strong>{a.title}</strong>
                      {a.detail ? <em>{a.detail}</em> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="staff-review__card">
            <p className="staff-review__label">งานส่งต่อ</p>
            {handoffs.length === 0 ? (
              <p className="staff-review__muted">ไม่มี</p>
            ) : (
              <ul className="staff-review__list">
                {handoffs.map((h) => (
                  <li key={h.id}>
                    <span>{h.status === "done" ? "●" : "○"}</span>
                    <div>
                      <strong>{h.title}</strong>
                      <em>จาก {displayNameFor(h.fromStaff)} · {h.status}</em>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="staff-review__card staff-review__card--wide">
            <p className="staff-review__label">Routine checklist กะนี้{shift ? "" : " (ไม่ได้เข้ากะ — ไม่มี routine)"}</p>
            {routine.length === 0 ? (
              <p className="staff-review__muted">—</p>
            ) : (
              routine.map((phase) => (
                <div key={phase.id} className="staff-review__phase">
                  <strong>{phase.title}</strong>
                  <ul>
                    {phase.checklist.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </article>
        </div>
      )}
    </div>
  );
}
