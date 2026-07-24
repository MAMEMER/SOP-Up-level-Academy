"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SHIFT_START_OPTIONS,
  auditPlan,
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
  setActualStatus,
  type ActualDoc,
  type DayActivity,
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
// PLAN dropdown = the planned shift only. Leave/absent is what ACTUALLY happened on the
// day (not planned), so it's recorded in the ACTUAL row instead — see onActualChange.
// One distinct accent color per staff so a row reads as "whose" at a glance.
const STAFF_COLORS = ["#4A90D9", "#FF8C42", "#2E9E6B", "#B8477E", "#8F6FE6", "#C9902B"];

// Opaque light tint of a staff color (blend with white) — computed in JS instead of CSS
// color-mix so it renders solidly on every browser (older Safari lacks color-mix, which
// left the sticky name cell transparent = the "see-through" gap the owner reported).
function tintColor(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * pct + 255 * (1 - pct));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

const CELL_OPTIONS: { value: string; label: string; cell: CellValue }[] = [
  { value: "off", label: "OFF", cell: { assignment: "off" } },
  { value: "s1|09:00", label: "ก1 09:00", cell: { assignment: "s1", startTime: "09:00" } },
  { value: "s1|11:00", label: "ก1 11:00", cell: { assignment: "s1", startTime: "11:00" } },
  { value: "s2|11:30", label: "ก2 11:30", cell: { assignment: "s2", startTime: "11:30" } },
  { value: "s2|13:00", label: "ก2 13:00", cell: { assignment: "s2", startTime: "13:00" } }
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
  const [events, setEvents] = useState<Record<string, { title: string; activities: DayActivity[] }>>({});
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
  const [reloadNonce, setReloadNonce] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [density, setDensity] = useState<"compact" | "normal" | "large">("normal");
  const [showIssues, setShowIssues] = useState(false);

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
        const eventMap: Record<string, { title: string; activities: DayActivity[] }> = {};
        const gameLabels = new Set(gamePresets.map((g) => g.label));
        for (const ev of data.events as EventDoc[]) {
          const activities = ev.activities ?? (ev.game ? [{ game: ev.game, time: ev.time ?? "" }] : []);
          // Drop a stale auto-title that just repeats a game name (it now shows as a chip).
          const title = gameLabels.has(ev.title) ? "" : ev.title;
          eventMap[ev.workDate] = { title, activities };
        }
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
  }, [branch, month, reloadNonce]);

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

  async function persistDay(workDate: string, day: { title: string; activities: DayActivity[] }) {
    try {
      await saveDayEvent({ branch, workDate, title: day.title, activities: day.activities, updatedBy: plannedBy });
    } catch {
      setError("บันทึกกิจกรรมไม่สำเร็จ");
    }
  }

  async function onEventBlur(workDate: string, title: string) {
    const trimmed = title.trim();
    const day = { title: trimmed, activities: events[workDate]?.activities ?? [] };
    setEvents((prev) => ({ ...prev, [workDate]: day }));
    await persistDay(workDate, day);
  }

  async function removeActivity(workDate: string, index: number) {
    const day = events[workDate];
    if (!day) return;
    const next = { ...day, activities: day.activities.filter((_, i) => i !== index) };
    setEvents((prev) => ({ ...prev, [workDate]: next }));
    await persistDay(workDate, next);
  }

  // Recurring activity preset: e.g. every Tuesday = Pokémon 19:00 → ADDS the activity
  // (with a game logo) to every matching weekday — multiple games can share a day/time
  // since the store has space for parallel events. Dedupes exact game+time.
  async function applyActivityPreset(gameKey: string, weekday: number, time: string) {
    const preset = gamePresets.find((g) => g.key === gameKey);
    if (!preset) return;
    const targetDates = datesForWeekday(month, weekday);
    setError(null);
    const updated: Record<string, { title: string; activities: DayActivity[] }> = {};
    setEvents((prev) => {
      const next = { ...prev };
      for (const d of targetDates) {
        const existing = next[d] ?? { title: "", activities: [] };
        const already = existing.activities.some((a) => a.game === preset.key && a.time === time);
        const day = already ? existing : { ...existing, activities: [...existing.activities, { game: preset.key, time, title: preset.label }] };
        next[d] = day;
        updated[d] = day;
      }
      return next;
    });
    try {
      await Promise.all(Object.entries(updated).map(([d, day]) => saveDayEvent({ branch, workDate: d, title: day.title, activities: day.activities, updatedBy: plannedBy })));
    } catch {
      setError("ลงกิจกรรมไม่สำเร็จ");
    }
  }

  // ACTUAL status (leave/absent) — a real event on the day, recorded in the ACTUAL row.
  async function onActualChange(workDate: string, staffCode: string, status: "normal" | "leave_personal" | "leave_sick" | "absent") {
    const key = cellKey(workDate, staffCode);
    setActuals((prev) => {
      const base = prev[key] ?? ({ branch, month: workDate.slice(0, 7), workDate, staffCode, updatedAt: "", updatedBy: plannedBy } as ActualDoc);
      const next: ActualDoc = { ...base };
      next.leaveType = status === "leave_personal" ? "personal" : status === "leave_sick" ? "sick" : undefined;
      next.absent = status === "absent" ? true : undefined;
      return { ...prev, [key]: next };
    });
    try {
      await setActualStatus({ branch, workDate, staffCode, status, updatedBy: plannedBy });
    } catch {
      setError("บันทึกสถานะจริงไม่สำเร็จ");
    }
  }

  // Manual "save everything" fallback in case an auto-save didn't land. Re-persists the
  // full current grid: plans, day activities, and any actual leave/absent overrides
  // (clock-in stays owned by the StoreHub sync).
  async function saveAll() {
    setSyncMsg("กำลังบันทึกทั้งหมด…");
    try {
      const jobs: Promise<unknown>[] = [];
      for (const [key, cell] of Object.entries(plans)) {
        const [workDate, staffCode] = key.split("__");
        jobs.push(savePlanCell({ branch, workDate, staffCode, assignment: cell.assignment, startTime: cell.startTime, updatedBy: plannedBy }));
      }
      for (const [workDate, day] of Object.entries(events)) {
        if (day.title || day.activities.length) jobs.push(saveDayEvent({ branch, workDate, title: day.title, activities: day.activities, updatedBy: plannedBy }));
      }
      for (const [key, actual] of Object.entries(actuals)) {
        const status = actual.leaveType === "personal" ? "leave_personal" : actual.leaveType === "sick" ? "leave_sick" : actual.absent ? "absent" : null;
        if (status) {
          const [workDate, staffCode] = key.split("__");
          jobs.push(setActualStatus({ branch, workDate, staffCode, status, updatedBy: plannedBy }));
        }
      }
      await Promise.all(jobs);
      setSyncMsg(`บันทึกแล้ว ${jobs.length} รายการ`);
    } catch {
      setSyncMsg("บันทึกบางส่วนไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  async function syncClockIn() {
    setSyncMsg("กำลังดึง clock-in จาก StoreHub…");
    try {
      const res = await fetch(`/api/storehub/sync-clockin?month=${month}&branch=${branch}`);
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`ดึง clock-in สำเร็จ ${data.synced} รายการ`);
        setReloadNonce((n) => n + 1);
      } else if (res.status === 503) {
        setSyncMsg("StoreHub ยังไม่ได้ตั้งค่า (env)");
      } else {
        setSyncMsg("ดึงไม่สำเร็จ");
      }
    } catch {
      setSyncMsg("ดึงไม่สำเร็จ");
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
          <button type="button" className="shift-planner__auto-btn" onClick={syncClockIn}>
            ดึง clock-in StoreHub
          </button>
          <div className="shift-planner__density">
            <span>ขนาด</span>
            {(["compact", "normal", "large"] as const).map((d) => (
              <button key={d} type="button" className={density === d ? "is-active" : ""} onClick={() => setDensity(d)}>
                {d === "compact" ? "เล็ก" : d === "normal" ? "ปกติ" : "ใหญ่"}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="shift-planner__save-bar">
        <span className="shift-planner__autosave-note">บันทึกอัตโนมัติทุกการแก้ไข</span>
        <button type="button" className="shift-planner__save-btn" onClick={saveAll}>💾 บันทึกทั้งหมด</button>
      </div>

      {syncMsg ? <p className="shift-planner__sync-msg">{syncMsg}</p> : null}

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
        <div className="shift-planner__warn">
          <button type="button" className="shift-planner__warn-toggle" onClick={() => setShowIssues((v) => !v)}>
            ⚠️ {issues.length} คำเตือน {showIssues ? "▲" : "▼"}
          </button>
          {showIssues ? (
            <ul className="shift-planner__issues">
              {issues.map((issue) => (
                <li key={`${issue.kind}-${issue.ref}`} className={`shift-planner__issue shift-planner__issue--${issue.kind}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="shift-planner__ok">แผนสมดุล — ทุกวันมีคนพอ และกะเฉลี่ยดี</p>
      )}

      {loading ? (
        <p className="shift-planner__loading">กำลังโหลดตาราง…</p>
      ) : (
        <div className="shift-planner__scroll">
          <table className={`shift-planner__grid shift-planner__grid--${density}`}>
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
                  return (
                    <th key={date} className="shift-planner__event-cell">
                      {ev?.activities?.length ? (
                        <div className="shift-planner__acts">
                          {ev.activities.map((act, i) => {
                            const preset = gamePreset(act.game);
                            return (
                              <span key={i} className="shift-planner__act" title={`${preset?.label ?? act.game}${act.time ? ` ${act.time}` : ""}`}>
                                {preset ? <img src={preset.logo} alt={preset.label} /> : null}
                                <span className="shift-planner__act-name">{preset?.label ?? act.game}</span>
                                {act.time ? <span className="shift-planner__act-time">{act.time}</span> : null}
                                <button type="button" onClick={() => removeActivity(date, i)} aria-label="ลบ">×</button>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                      <input
                        value={ev?.title ?? ""}
                        placeholder={ev?.activities?.length ? "โน้ต" : "—"}
                        onChange={(e) => setEvents((prev) => ({ ...prev, [date]: { title: e.target.value, activities: prev[date]?.activities ?? [] } }))}
                        onBlur={(e) => onEventBlur(date, e.target.value)}
                        aria-label={`กิจกรรมวันที่ ${date}`}
                      />
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((entry, staffIndex) => {
                const summary = summariseStaff(entry.code, planCells);
                const actualLeaveCount = dates.filter((d) => actuals[cellKey(d, entry.code)]?.leaveType).length;
                const color = STAFF_COLORS[staffIndex % STAFF_COLORS.length];
                return (
                  <tr key={entry.code} style={{ ["--staff-color" as string]: color }}>
                    <th className="shift-planner__sticky shift-planner__staff">
                      {/* opaque bg as an absolute layer = fills the full row height even in
                          Safari (sticky cells there don't paint bg for the whole cell) */}
                      <span className="shift-planner__staff-bg" style={{ background: tintColor(color, 0.12) }} />
                      <span className="shift-planner__staff-fill">
                        <span className="shift-planner__staff-chip" style={{ borderColor: color, background: "#fff" }}>
                          <span className="shift-planner__staff-dot" style={{ background: color }} />
                          <span className="shift-planner__staff-name" style={{ color }}>{entry.displayName}</span>
                          <span className="shift-planner__staff-type">{entry.employmentType === "full_time" ? "Full" : "Part"}</span>
                        </span>
                      </span>
                    </th>
                    {dates.map((date) => {
                      const key = cellKey(date, entry.code);
                      const value = cellToValue(plans[key]);
                      const working = value.startsWith("s");
                      const actual = actuals[key];
                      const actualStatus = actual?.leaveType === "personal" ? "leave_personal" : actual?.leaveType === "sick" ? "leave_sick" : actual?.absent ? "absent" : "normal";
                      const late = actualStatus === "normal" && actual?.clockIn && plans[key]?.startTime && actual.clockIn > (plans[key]?.startTime ?? "");
                      return (
                        <td key={date} className="shift-planner__cell" style={{ background: working ? `${color}14` : undefined }}>
                          <select
                            value={value}
                            onChange={(e) => onCellChange(date, entry.code, e.target.value)}
                            disabled={savingKey === key}
                            className={value.startsWith("s1") ? "sel-s1" : value.startsWith("s2") ? "sel-s2" : "sel-off"}
                            style={working ? { borderColor: color, color } : undefined}
                          >
                            {CELL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {actualStatus === "normal" && actual?.clockIn ? (
                            <span className={`shift-planner__actual shift-planner__actual--${late ? "late" : "ontime"}`}>เข้า {actual.clockIn}</span>
                          ) : null}
                          <select
                            className={`shift-planner__actual-sel${actualStatus !== "normal" ? " shift-planner__actual-sel--flag" : ""}`}
                            value={actualStatus}
                            onChange={(e) => onActualChange(date, entry.code, e.target.value as "normal" | "leave_personal" | "leave_sick" | "absent")}
                            title="สิ่งที่เกิดขึ้นจริง (ลา/ขาด)"
                          >
                            <option value="normal">ตามจริง</option>
                            <option value="leave_personal">ลากิจ</option>
                            <option value="leave_sick">ลาป่วย</option>
                            <option value="absent">ขาด</option>
                          </select>
                        </td>
                      );
                    })}
                    <td className="shift-planner__summary">
                      <span>รวม {summary.totalWorkDays}</span>
                      <span>ก1 {summary.s1Count} · ก2 {summary.s2Count}</span>
                      <span>ลา {actualLeaveCount}</span>
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
