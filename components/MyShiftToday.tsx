"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shiftEndTime, shiftLabel, type ShiftCode } from "../lib/shift-schedule.ts";
import { fetchShiftForStaffDate, type PlanDoc } from "../lib/shift-schedule-store.ts";
import {
  fetchMyAssignments,
  fetchOpenHandoffs,
  handoffsForStaff,
  markAssignmentDone,
  type WorkAssignment,
  type WorkHandoff
} from "../lib/work-assignments-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

type LoadState = {
  plan: PlanDoc | null;
  assignments: WorkAssignment[];
  handoffs: WorkHandoff[];
};

function assignmentIso() {
  return new Date().toISOString();
}

export function MyShiftToday({
  staffCode,
  branch,
  workDate
}: {
  staffCode: string;
  branch: string;
  workDate: string;
}) {
  const [state, setState] = useState<LoadState>({ plan: null, assignments: [], handoffs: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchShiftForStaffDate(branch, workDate, staffCode),
      fetchMyAssignments(branch, workDate, staffCode),
      fetchOpenHandoffs(branch)
    ])
      .then(([plan, assignments, allHandoffs]) => {
        if (!alive) return;
        setState({ plan, assignments, handoffs: handoffsForStaff(allHandoffs, staffCode) });
      })
      .catch(() => alive && setState({ plan: null, assignments: [], handoffs: [] }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, workDate, staffCode]);

  const assignment = state.plan?.assignment;
  const working = assignment === "s1" || assignment === "s2";
  const shift = working ? (assignment as ShiftCode) : null;
  const start = state.plan?.startTime;

  const openAssignments = state.assignments.filter((a) => a.status === "open");
  const openHandoffs = state.handoffs.filter((h) => h.status !== "done");

  async function completeAssignment(id: string) {
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) => (a.id === id ? { ...a, status: "done" } : a))
    }));
    try {
      await markAssignmentDone(id, assignmentIso());
    } catch {
      /* optimistic — stays checked locally even if the write is retried later */
    }
  }

  return (
    <section className="my-shift">
      <div className="my-shift__head">
        <p className="eyebrow">วันนี้ของฉัน</p>
        <h2>{displayNameFor(staffCode)}</h2>
      </div>

      {loading ? (
        <p className="my-shift__loading">กำลังโหลด…</p>
      ) : (
        <div className="my-shift__grid">
          <article className={`my-shift__card${working ? " my-shift__card--work" : ""}`}>
            <p className="my-shift__label">กะวันนี้</p>
            {working && shift ? (
              <>
                <strong className="my-shift__shift">{shiftLabel(shift)}</strong>
                <p className="my-shift__time">เข้า {start} · ออก {shiftEndTime(start ?? "")}</p>
                <Link href="/checklist" className="primary-action my-shift__cta">เปิด Checklist กะฉัน</Link>
              </>
            ) : assignment === "leave_personal" || assignment === "leave_sick" ? (
              <strong className="my-shift__shift">{assignment === "leave_sick" ? "ลาป่วยวันนี้" : "ลากิจวันนี้"}</strong>
            ) : (
              <>
                <strong className="my-shift__shift my-shift__shift--off">วันนี้ไม่ใช่กะคุณ</strong>
                <p className="my-shift__time">เปิด checklist ดูอ้างอิงได้ แต่ไม่ใช่เวรของคุณวันนี้</p>
                <Link href="/checklist" className="btn-soft my-shift__cta">เปิด Checklist (อ้างอิง)</Link>
              </>
            )}
          </article>

          <article className="my-shift__card">
            <p className="my-shift__label">งานที่มอบหมาย ({openAssignments.length})</p>
            {openAssignments.length === 0 ? (
              <p className="my-shift__empty">ไม่มีงานค้าง</p>
            ) : (
              <ul className="my-shift__list">
                {openAssignments.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => completeAssignment(a.id)} aria-label="ทำเสร็จ">○</button>
                    <span>
                      <strong>{a.title}</strong>
                      {a.detail ? <em>{a.detail}</em> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="my-shift__card">
            <p className="my-shift__label">งานส่งต่อ ({openHandoffs.length})</p>
            {openHandoffs.length === 0 ? (
              <p className="my-shift__empty">ไม่มีงานส่งต่อ</p>
            ) : (
              <ul className="my-shift__list">
                {openHandoffs.map((h) => (
                  <li key={h.id}>
                    <span>
                      <strong>{h.title}</strong>
                      <em>จาก {displayNameFor(h.fromStaff)}{h.status === "claimed" ? " · รับแล้ว" : ""}</em>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/handoff" className="my-shift__link">จัดการงานส่งต่อ →</Link>
          </article>
        </div>
      )}
    </section>
  );
}
