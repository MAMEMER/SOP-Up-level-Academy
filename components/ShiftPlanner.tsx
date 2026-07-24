"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SHIFT_START_OPTIONS,
  auditPlan,
  shiftEndTime,
  summariseStaff,
  type PlanCell,
  type ShiftAssignment,
  type ShiftCode
} from "../lib/shift-schedule.ts";
import { generateMonthPlan } from "../lib/shift-auto.ts";
import { gamePresets, gamePreset, datesForWeekday, holidayName } from "../lib/planner-activities.ts";
import {
  loadMonthPlan,
  savePlanCell,
  saveDayEvent,
  type ActualDoc,
  type EventDoc,
  type PlanDoc
} from "../lib/shift-schedule-store.ts";

type StaffEntry = {
  code: string;
  displayName: string;
  employmentType: "full_time" | "part_time";
  branch: string;
};

type CellValue = { assignment: ShiftAssignment; startTime?: string };

// A single dropdown encodes shift + entry time so the owner picks in one click.
const CELL_OPTIONS: { value: string; label: string; cell: CellValue }[] = [
  { value: "off", label: "OFF", cell: { assignment: "off" } },
  { value: "s1|09:00", label: "กะ1 · 09:00", cell: { assignment: "s1", startTime: "09:00" } },
  { value: "s1|11:00", label: "กะ1 · 11:00", cell: { assignment: "s1", startTime: "11:00" } },
  { value: "s2|11:30", label: "กะ2 · 11:30", cell: { assignment: "s2", startTime: "11:30" } },
  { value: "s2|13:00", label: "กะ2 · 13:00", cell: { assignment: "s2", startTime: "13:00" } },
  { value: "leave_personal", label: "ลากิจ", cell: { assignment: "leave_personal" } },
  { value: "leave_sick", label: "ลาป่วย", cell: { assignment: "leave_sick" } }
];

function cellToValue(cell: CellValue | undefined): string {
  if (!cell || cell.assignment === "off") return "off";
  if (cell.assignment === "s1" || cell.assignment === "s2") {
    return `${cell.assignment}|${cell.startTime ?? SHIFT_START_OPTIONS[cell.assignment][0]}`;
  }
  return cell.assignment;
}

function valueToCell(value: string): CellValue {
  return CELL_OPTIONS.find((option) => option.value === value)?.cell ?? { assignment: "off" };
}

function cellKey(workDate: string, staffCode: string): string {
  return `${workDate}__${staffCode}`;
}

function monthDates(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function currentMonth(): string {
  // Avoid Date.now-based month drift across timezones by anchoring to Bangkok noon.
  const now = new Date();
  const bkk = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function weekdayLabel(workDate: string): string {
  const day = new Date(`${workDate}T12:00:00+07:00`).getUTCDay();
  return WEEKDAY_TH[day];
}

function isPast(workDate: string): boolean {
  return Date.parse(`${workDate}T23:59:59+07:00`) < Date.now();
}

export function ShiftPlanner({
  staff,
  plannedBy,
  branch
}: {
  staff: StaffEntry[];
  plannedBy: string;
  branch: string;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [plans, setPlans] = useState<Record<string, CellValue>>({});
  const [events, setEvents] = useState<Record<string, { title: string; game?: string; time?: string }>>({});
  const [actuals, setActuals] = useState<Record<string, ActualDoc>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAuto, setShowAuto] = useState(false);
  const [autoDaysOff, setAutoDaysOff] = useState<Record<string, number[]>>({});
  const [autoStart, setAutoStart] = useState<Record<string, ShiftCode | "">>({});
  const [autoBusy, setAutoBusy] = useState(false);
  const [presetGame, setPresetGame] = useState(gamePresets[0].key);
  const [presetWeekday, setPresetWeekday] = useState(2); // Tue default
  const [presetTime, setPresetTime] = useState("19:00");

  const dates = useMemo(() => monthDates(month), [month]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadMonthPlan(branch, month)
      .then((data) => {
        if (!alive) return;
        const planMap: Record<string, CellValue> = {};
        for (const plan of data.plans as PlanDoc[]) {
          planMap[cellKey(plan.workDate, plan.staffCode)] = { assignment: plan.assignment, startTime: plan.startTime };
        }
        const eventMap: Record<string, { title: string; game?: string; time?: string }> = {};
        for (const ev of data.events as EventDoc[]) eventMap[ev.workDate] = { title: ev.title, game: ev.game, time: ev.time };
        const actualMap: Record<string, ActualDoc> = {};
        for (const actual of data.actuals) actualMap[cellKey(actual.workDate, actual.staffCode)] = actual;
        setPlans(planMap);
        setEvents(eventMap);
        setActuals(actualMap);
      })
      .catch(() => alive && setError("โหลดตารางไม่สำเร็จ — เช็คสิทธิ์ Firestore"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, month]);

  const planCells: PlanCell[] = useMemo(
    () =>
      Object.entries(plans).map(([key, value]) => {
        const [workDate, staffCode] = key.split("__");
        return { workDate, staffCode, assignment: value.assignment, startTime: value.startTime };
      }),
    [plans]
  );

  const staffCodes = staff.map((entry) => entry.code);
  const issues = useMemo(() => auditPlan(planCells, dates, staffCodes), [planCells, dates, staffCodes]);
  const understaffedDates = new Set(issues.filter((i) => i.kind === "understaffed").map((i) => i.ref));

  async function onCellChange(workDate: string, staffCode: string, rawValue: string) {
    const key = cellKey(workDate, staffCode);
    const cell = valueToCell(rawValue);
    setPlans((prev) => ({ ...prev, [key]: cell }));
    setSavingKey(key);
    try {
      await savePlanCell({ branch, workDate, staffCode, assignment: cell.assignment, startTime: cell.startTime, updatedBy: plannedBy });
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }

  async function onEventBlur(workDate: string, title: string) {
    const trimmed = title.trim();
    const existing = events[workDate];
    setEvents((prev) => ({ ...prev, [workDate]: { ...prev[workDate], title: trimmed } }));
    try {
      await saveDayEvent({ branch, workDate, title: trimmed, game: existing?.game, time: existing?.time, updatedBy: plannedBy });
    } catch {
      setError("บันทึกกิจกรรมไม่สำเร็จ");
    }
  }

  // Recurring activity preset: e.g. every Tuesday = Pokémon 19:00 → stamps the event
  // (with a game logo) on every matching weekday of the month.
  async function applyActivityPreset(gameKey: string, weekday: number, time: string) {
    const preset = gamePresets.find((g) => g.key === gameKey);
    if (!preset) return;
    const targetDates = datesForWeekday(month, weekday);
    setError(null);
    setEvents((prev) => {
      const next = { ...prev };
      for (const d of targetDates) next[d] = { title: preset.label, game: preset.key, time };
      return next;
    });
    try {
      await Promise.all(
        targetDates.map((d) => saveDayEvent({ branch, workDate: d, title: preset.label, game: preset.key, time, updatedBy: plannedBy }))
      );
    } catch {
      setError("ลงกิจกรรมไม่สำเร็จ");
    }
  }

  function toggleDayOff(code: string, weekday: number) {
    setAutoDaysOff((prev) => {
      const current = prev[code] ?? [];
      const next = current.includes(weekday) ? current.filter((d) => d !== weekday) : [...current, weekday];
      return { ...prev, [code]: next };
    });
  }

  // Generate a whole month in one click, then the owner tweaks by hand. Writes every
  // cell to Firestore, overwriting the current month's plan.
  async function applyAuto() {
    if (!window.confirm(`จัดกะอัตโนมัติทับแผนเดือน ${month} ทั้งหมด? (ปรับเองทีหลังได้)`)) return;
    setAutoBusy(true);
    setError(null);
    try {
      const cells = generateMonthPlan({
        month,
        staff: staff.map((s) => ({
          code: s.code,
          daysOff: autoDaysOff[s.code] ?? [],
          ...(autoStart[s.code] ? { startShift: autoStart[s.code] as ShiftCode } : {})
        }))
      });
      // optimistic local update
      const nextPlans: Record<string, CellValue> = {};
      for (const cell of cells) nextPlans[cellKey(cell.workDate, cell.staffCode)] = { assignment: cell.assignment, startTime: cell.startTime };
      setPlans(nextPlans);
      // persist all cells
      await Promise.all(
        cells.map((cell) =>
          savePlanCell({ branch, workDate: cell.workDate, staffCode: cell.staffCode, assignment: cell.assignment, startTime: cell.startTime, updatedBy: plannedBy })
        )
      );
      setShowAuto(false);
    } catch {
      setError("จัดกะอัตโนมัติไม่สำเร็จ");
    } finally {
      setAutoBusy(false);
    }
  }

  function actualBadge(workDate: string, staffCode: string): { text: string; tone: string } | null {
    const actual = actuals[cellKey(workDate, staffCode)];
    const plan = plans[cellKey(workDate, staffCode)];
    if (actual?.leaveType) return { text: actual.leaveType === "sick" ? "ลาป่วย" : "ลากิจ", tone: "leave" };
    if (actual?.clockIn) {
      const late = plan?.startTime && actual.clockIn > plan.startTime;
      return { text: `เข้า ${actual.clockIn}`, tone: late ? "late" : "ontime" };
    }
    const planned = plan?.assignment === "s1" || plan?.assignment === "s2";
    if (planned && isPast(workDate)) return { text: "ยังไม่มีข้อมูล", tone: "missing" };
    return null;
  }

  return (
    <section className="shift-planner">
      <header className="shift-planner__bar">
        <div className="shift-planner__month">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="เดือนก่อน">‹</button>
          <strong>{month}</strong>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="เดือนถัดไป">›</button>
        </div>
        <div className="shift-planner__bar-right">
          <p className="shift-planner__hint">กะ1 = เปิดร้าน · กะ2 = ปิดร้าน · ทำงาน 9 ชม.</p>
          <button type="button" className="shift-planner__auto-btn" onClick={() => setShowAuto((v) => !v)}>
            ⚡ จัดกะอัตโนมัติ
          </button>
        </div>
      </header>

      <div className="shift-planner__preset-bar">
        <span className="shift-planner__preset-label">ลงกิจกรรมประจำ:</span>
        <select value={presetGame} onChange={(e) => setPresetGame(e.target.value)}>
          {gamePresets.map((g) => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
        </select>
        <span>ทุก</span>
        <select value={presetWeekday} onChange={(e) => setPresetWeekday(Number(e.target.value))}>
          {WEEKDAY_TH.map((w, wd) => (
            <option key={wd} value={wd}>{w}</option>
          ))}
        </select>
        <input type="time" value={presetTime} onChange={(e) => setPresetTime(e.target.value)} />
        <button type="button" className="shift-planner__preset-apply" onClick={() => applyActivityPreset(presetGame, presetWeekday, presetTime)}>
          ลงทั้งเดือน
        </button>
      </div>

      {showAuto ? (
        <section className="shift-auto">
          <p className="shift-auto__title">จัดกะอัตโนมัติเดือน {month} — ตั้งวันหยุดประจำ + กะเริ่ม แล้วกดจัดให้ทีเดียว (ปรับเองทีหลังได้)</p>
          <div className="shift-auto__grid">
            {staff.map((s) => (
              <div key={s.code} className="shift-auto__row">
                <span className="shift-auto__name">{s.displayName}</span>
                <div className="shift-auto__days">
                  <span className="shift-auto__label">หยุดประจำ:</span>
                  {WEEKDAY_TH.map((w, wd) => (
                    <button
                      key={wd}
                      type="button"
                      className={(autoDaysOff[s.code] ?? []).includes(wd) ? "shift-auto__day is-off" : "shift-auto__day"}
                      onClick={() => toggleDayOff(s.code, wd)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <label className="shift-auto__start">
                  เริ่ม
                  <select value={autoStart[s.code] ?? ""} onChange={(e) => setAutoStart((prev) => ({ ...prev, [s.code]: e.target.value as ShiftCode | "" }))}>
                    <option value="">อัตโนมัติ</option>
                    <option value="s1">กะ1</option>
                    <option value="s2">กะ2</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="shift-auto__actions">
            <button type="button" className="primary-action" onClick={applyAuto} disabled={autoBusy}>
              {autoBusy ? "กำลังจัด…" : "จัดกะทั้งเดือน"}
            </button>
            <button type="button" className="btn-soft" onClick={() => setShowAuto(false)}>ยกเลิก</button>
          </div>
        </section>
      ) : null}

      {error ? <p className="shift-planner__error">{error}</p> : null}

      {issues.length > 0 ? (
        <ul className="shift-planner__issues">
          {issues.map((issue) => (
            <li key={`${issue.kind}-${issue.ref}`} className={`shift-planner__issue shift-planner__issue--${issue.kind}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="shift-planner__ok">แผนสมดุล — ทุกวันมีคนพอ และกะเฉลี่ยดี</p>
      )}

      {loading ? (
        <p className="shift-planner__loading">กำลังโหลดตาราง…</p>
      ) : (
        <div className="shift-planner__scroll">
          <table className="shift-planner__grid">
            <thead>
              <tr>
                <th className="shift-planner__sticky">พนักงาน</th>
                {dates.map((date) => {
                  const holiday = holidayName(date);
                  return (
                    <th key={date} className={`${understaffedDates.has(date) ? "shift-planner__day shift-planner__day--warn" : "shift-planner__day"}${holiday ? " shift-planner__day--holiday" : ""}`}>
                      <span className="shift-planner__daynum">{Number(date.slice(-2))}</span>
                      <span className="shift-planner__weekday">{weekdayLabel(date)}</span>
                      {holiday ? <span className="shift-planner__holiday" title={holiday}>{holiday}</span> : null}
                    </th>
                  );
                })}
                <th className="shift-planner__summary-head">สรุป</th>
              </tr>
              <tr>
                <th className="shift-planner__sticky shift-planner__event-label">กิจกรรม</th>
                {dates.map((date) => {
                  const ev = events[date];
                  const preset = gamePreset(ev?.game);
                  return (
                    <th key={date} className="shift-planner__event-cell">
                      {preset ? <img className="shift-planner__game-logo" src={preset.logo} alt={preset.label} title={`${preset.label}${ev?.time ? ` ${ev.time}` : ""}`} /> : null}
                      <input
                        value={ev?.title ?? ""}
                        placeholder="—"
                        onChange={(e) => setEvents((prev) => ({ ...prev, [date]: { ...prev[date], title: e.target.value } }))}
                        onBlur={(e) => onEventBlur(date, e.target.value)}
                        aria-label={`กิจกรรมวันที่ ${date}`}
                      />
                      {ev?.time ? <span className="shift-planner__event-time">{ev.time}</span> : null}
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((entry) => {
                const summary = summariseStaff(entry.code, planCells);
                return (
                  <tr key={entry.code}>
                    <th className="shift-planner__sticky shift-planner__staff">
                      <span className="shift-planner__staff-name">{entry.displayName}</span>
                      <span className="shift-planner__staff-type">{entry.employmentType === "full_time" ? "Full" : "Part"}</span>
                    </th>
                    {dates.map((date) => {
                      const key = cellKey(date, entry.code);
                      const value = cellToValue(plans[key]);
                      const badge = actualBadge(date, entry.code);
                      const working = value.startsWith("s");
                      return (
                        <td key={date} className={`shift-planner__cell${working ? " shift-planner__cell--work" : ""}`}>
                          <select
                            value={value}
                            onChange={(e) => onCellChange(date, entry.code, e.target.value)}
                            disabled={savingKey === key}
                            className={value.startsWith("s1") ? "sel-s1" : value.startsWith("s2") ? "sel-s2" : value.startsWith("leave") ? "sel-leave" : "sel-off"}
                          >
                            {CELL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {working ? (
                            <span className="shift-planner__end">ออก {shiftEndTime(plans[key]?.startTime ?? "")}</span>
                          ) : null}
                          {badge ? <span className={`shift-planner__actual shift-planner__actual--${badge.tone}`}>{badge.text}</span> : null}
                        </td>
                      );
                    })}
                    <td className="shift-planner__summary">
                      <span>รวม {summary.totalWorkDays}</span>
                      <span>ก1 {summary.s1Count} · ก2 {summary.s2Count}</span>
                      <span>ลา {summary.personalLeave + summary.sickLeave}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th className="shift-planner__sticky">เข้างาน/วัน</th>
                {dates.map((date) => {
                  const count = planCells.filter((cell) => cell.workDate === date && (cell.assignment === "s1" || cell.assignment === "s2")).length;
                  return (
                    <td key={date} className={count > 0 && count < 2 ? "shift-planner__count shift-planner__count--warn" : "shift-planner__count"}>
                      {count || ""}
                    </td>
                  );
                })}
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
