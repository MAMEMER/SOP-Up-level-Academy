"use client";

// ตารางกะของฉัน — ปฏิทินรายเดือน, read-only. Staff open this to see which days they work
// and at what time, plus who is on with them. Everything renders from the plan; there is
// no edit control here and the write path (/api/schedule POST) is admin-only, so a
// staffer cannot change the roster from this page.

import { useEffect, useState } from "react";
import { loadMonthPlan } from "../lib/shift-schedule-store.ts";
import { shiftLabel } from "../lib/shift-schedule.ts";
import type { PlanCell } from "../lib/shift-schedule.ts";
import {
  buildScheduleRows,
  calendarWeekdayLabels,
  calendarWeeks,
  monthDays,
  monthLabel,
  shiftMonth,
  summaryLine,
  workingOn,
  type StaffEntry
} from "../lib/schedule-view.ts";

export function MyScheduleView({
  staff,
  branch,
  myStaffCode,
  today,
  initialMonth
}: {
  staff: StaffEntry[];
  branch: string;
  myStaffCode: string | null;
  /** YYYY-MM-DD in Bangkok, resolved on the server so the highlight never drifts */
  today: string;
  initialMonth: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [plans, setPlans] = useState<PlanCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadMonthPlan(branch, month)
      .then((data) => {
        if (!alive) return;
        setPlans(
          data.plans.map((plan) => ({
            staffCode: plan.staffCode,
            workDate: plan.workDate,
            assignment: plan.assignment,
            startTime: plan.startTime
          }))
        );
      })
      .catch(() => alive && setError("โหลดตารางกะไม่สำเร็จ ลองรีเฟรชอีกครั้ง"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, month]);

  const days = monthDays(month);
  const rows = buildScheduleRows(staff, plans, days, myStaffCode);
  const weeks = calendarWeeks(rows, days);
  const myRow = rows.find((row) => row.isMe);
  const showsToday = today.startsWith(month);
  const todayCell = showsToday ? myRow?.cells.find((cell) => cell.workDate === today) : undefined;
  const todayTeam = showsToday ? workingOn(rows, today) : [];

  return (
    <section className="staff-schedule">
      <header className="staff-schedule__bar">
        <div className="staff-schedule__month">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="เดือนก่อน">‹</button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="เดือนถัดไป">›</button>
        </div>
        <p className="staff-schedule__note">ดูอย่างเดียว · แก้ไขได้เฉพาะแอดมิน</p>
      </header>

      {myRow ? (
        <div className="staff-schedule__mine">
          <div>
            <small>กะของฉันวันนี้</small>
            <strong>
              {todayCell?.timeRange
                ? `${todayCell.timeRange} · ${shiftLabel(todayCell.assignment === "s2" ? "s2" : "s1")}`
                : todayCell?.tone === "off"
                  ? "วันหยุด"
                  : todayCell?.tone === "leave"
                    ? todayCell.label
                    : showsToday
                      ? "ไม่มีกะวันนี้"
                      : "—"}
            </strong>
          </div>
          <div>
            <small>เดือนนี้</small>
            <strong>{summaryLine(myRow.summary)}</strong>
          </div>
          {todayTeam.length ? (
            <div>
              <small>เข้างานวันนี้</small>
              <strong>{todayTeam.map((entry) => `${entry.displayName} ${entry.timeRange}`).join(" · ")}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="staff-schedule__error">{error}</p> : null}

      <div className="staff-calendar" role="grid" aria-label={`ตารางกะ ${monthLabel(month)}`}>
        <div className="staff-calendar__head">
          {calendarWeekdayLabels.map((label, index) => (
            <span key={label} className={index === 0 || index === 6 ? "is-weekend" : ""}>
              {label}
            </span>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="staff-calendar__week">
            {week.map((cell, dayIndex) => {
              if (!cell.day) return <div key={`pad-${dayIndex}`} className="staff-calendar__day is-pad" />;
              const isToday = cell.day.workDate === today;
              const mineTone = cell.mine?.tone ?? "blank";
              return (
                <div
                  key={cell.day.workDate}
                  className={`staff-calendar__day tone-${mineTone} ${isToday ? "is-today" : ""} ${cell.day.isWeekend ? "is-weekend" : ""}`}
                >
                  <div className="staff-calendar__date">
                    <span>{cell.day.day}</span>
                    {isToday ? <em>วันนี้</em> : null}
                  </div>

                  {cell.mine?.timeRange ? (
                    <p className="staff-calendar__mine">
                      ฉัน {cell.mine.timeRange}
                    </p>
                  ) : cell.mine?.tone === "off" ? (
                    <p className="staff-calendar__mine is-off">หยุด</p>
                  ) : cell.mine?.tone === "leave" ? (
                    <p className="staff-calendar__mine is-off">{cell.mine.label}</p>
                  ) : null}

                  <ul className="staff-calendar__team">
                    {cell.working
                      .filter((entry) => !entry.isMe)
                      .map((entry) => (
                        <li key={entry.staffCode} className={`tone-${entry.tone}`}>
                          <span>{entry.displayName}</span>
                          <small>{entry.timeRange}</small>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {loading ? <p className="staff-schedule__note">กำลังโหลด…</p> : null}
      {!loading && !plans.length ? <p className="staff-schedule__note">เดือนนี้ยังไม่ได้จัดกะ</p> : null}
    </section>
  );
}
