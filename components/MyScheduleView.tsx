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
  type DayEventInput,
  type StaffEntry
} from "../lib/schedule-view.ts";

export function MyScheduleView({
  staff,
  branches,
  myStaffCode,
  today,
  initialMonth
}: {
  staff: StaffEntry[];
  /** ทุกสาขาที่มีในร้าน — ใช้แยกสีและกรองมุมมอง */
  branches: { key: string; shortName: string; tag: string; color: string }[];
  myStaffCode: string | null;
  /** YYYY-MM-DD in Bangkok, resolved on the server so the highlight never drifts */
  today: string;
  initialMonth: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  // "all" = เห็นทุกสาขาในปฏิทินเดียว (คนที่สลับไปช่วยอีกสาขาจะได้ไม่หายไป)
  const [view, setView] = useState<string>("all");
  const [plans, setPlans] = useState<PlanCell[]>([]);
  const [events, setEvents] = useState<DayEventInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadMonthPlan("all", month)
      .then((data) => {
        if (!alive) return;
        setPlans(
          data.plans.map((plan) => ({
            staffCode: plan.staffCode,
            workDate: plan.workDate,
            assignment: plan.assignment,
            startTime: plan.startTime,
            branch: plan.branch
          }))
        );
        // กิจกรรมที่แอดมินลงไว้ในหน้าตารางกะ (อีเวนต์เกม + งาน Stock ประจำ)
        setEvents(
          data.events.map((event) => ({
            workDate: event.workDate,
            title: event.title,
            activities: event.activities
          }))
        );
      })
      .catch(() => alive && setError("โหลดตารางกะไม่สำเร็จ ลองรีเฟรชอีกครั้ง"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [month]);

  const days = monthDays(month);
  const branchByKey = Object.fromEntries(branches.map((entry) => [entry.key, entry]));
  // กรองตามสาขาที่เลือกดู — กะของสาขาอื่นถูกซ่อน แต่ "ฉัน" ยังเห็นกะตัวเองเสมอ
  const visiblePlans =
    view === "all"
      ? plans
      : plans.filter((plan) => (plan.branch || branches[0]?.key) === view || plan.staffCode === myStaffCode);
  const rows = buildScheduleRows(staff, visiblePlans, days, myStaffCode);
  const weeks = calendarWeeks(rows, days, events);
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
        {branches.length > 1 ? (
          <div className="shift-planner__branches" role="group" aria-label="เลือกสาขา">
            <button
              type="button"
              className={view === "all" ? "is-active" : ""}
              onClick={() => setView("all")}
              style={view === "all" ? { background: "var(--color-ink)", borderColor: "var(--color-ink)" } : undefined}
            >
              ทุกสาขา
            </button>
            {branches.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={view === entry.key ? "is-active" : ""}
                onClick={() => setView(entry.key)}
                style={
                  view === entry.key
                    ? { background: entry.color, borderColor: entry.color }
                    : { borderColor: entry.color, color: entry.color }
                }
              >
                <span className="shift-planner__branch-dot" style={{ background: entry.color }} />
                {entry.shortName}
              </button>
            ))}
          </div>
        ) : null}
        <p className="staff-schedule__note">ดูอย่างเดียว · แก้ไขได้เฉพาะผู้มีสิทธิ์จัดการ</p>
      </header>

      {myRow ? (
        <div className="staff-schedule__mine">
          <div>
            <small>กะของฉันวันนี้</small>
            <strong>
              {todayCell?.timeRange
                ? `${todayCell.timeRange} · ${branchByKey[todayCell.branch ?? ""]?.shortName ?? ""} · ${shiftLabel(todayCell.assignment === "s2" ? "s2" : "s1")}`
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
              <strong>
                {todayTeam
                  .map((entry) =>
                    `${entry.displayName} ${entry.timeRange}${
                      branches.length > 1 && entry.branch ? ` (${branchByKey[entry.branch]?.shortName ?? entry.branch})` : ""
                    }`
                  )
                  .join(" · ")}
              </strong>
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
                    <p
                      className="staff-calendar__mine"
                      style={
                        cell.mine.branch && branchByKey[cell.mine.branch]
                          ? { color: branchByKey[cell.mine.branch].color }
                          : undefined
                      }
                    >
                      ฉัน {cell.mine.timeRange}
                      {branches.length > 1 && cell.mine.branch ? ` · ${branchByKey[cell.mine.branch]?.tag ?? ""}` : ""}
                    </p>
                  ) : cell.mine?.tone === "off" ? (
                    <p className="staff-calendar__mine is-off">หยุด</p>
                  ) : cell.mine?.tone === "leave" ? (
                    <p className="staff-calendar__mine is-off">{cell.mine.label}</p>
                  ) : null}

                  {cell.activities.length ? (
                    <ul className="staff-calendar__acts">
                      {cell.activities.map((activity) =>
                        activity.href ? (
                          <li key={activity.key} className="is-task">
                            <a href={activity.href}>
                              <b>{activity.badge}</b>
                              <span>{activity.label}</span>
                            </a>
                          </li>
                        ) : (
                          <li key={activity.key}>
                            {activity.logo ? <img src={activity.logo} alt="" /> : null}
                            <span>{activity.label}</span>
                            {activity.time ? <small>{activity.time}</small> : null}
                          </li>
                        )
                      )}
                    </ul>
                  ) : null}

                  {cell.note ? <p className="staff-calendar__note">{cell.note}</p> : null}

                  <ul className="staff-calendar__team">
                    {cell.working
                      .filter((entry) => !entry.isMe)
                      .map((entry) => (
                        <li key={entry.staffCode} className={`tone-${entry.tone}`}>
                          {branches.length > 1 && entry.branch ? (
                            <span
                              className="staff-calendar__branch-dot"
                              style={{ background: branchByKey[entry.branch]?.color }}
                              title={branchByKey[entry.branch]?.shortName}
                            />
                          ) : null}
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
