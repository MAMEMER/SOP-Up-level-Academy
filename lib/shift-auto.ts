// Auto shift generator: fill a whole month in one click, then the owner tweaks by hand.
// Rules it follows (all soft — the grid stays fully editable afterward):
//   • each person alternates กะ1 ↔ กะ2 from their previous working day (rotation)
//   • a configurable fixed weekly day-off per person (e.g. ICE off every Saturday)
//   • every day keeps ≥ 2 people working — if fixed days-off would drop a day below 2,
//     the least-worked off-person is pulled back in for coverage
//   • when ≥ 2 work, both an opening (กะ1) and a closing (กะ2) slot are covered
//   • a seed start shift per person (e.g. ICE starts กะ1 on their first day)

import { defaultShiftStart, type PlanCell, type ShiftCode } from "./shift-schedule.ts";

export type AutoStaffConfig = {
  code: string;
  /** weekday numbers off every week: 0=Sun … 6=Sat */
  daysOff: number[];
  /** shift on this person's first working day (seed); defaults bycolumn order */
  startShift?: ShiftCode;
};

export type AutoPlanConfig = {
  month: string; // YYYY-MM
  staff: AutoStaffConfig[];
};

function monthDates(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function weekday(workDate: string): number {
  return new Date(`${workDate}T12:00:00+07:00`).getUTCDay();
}

function opposite(shift: ShiftCode): ShiftCode {
  return shift === "s1" ? "s2" : "s1";
}

export const MIN_STAFF_PER_DAY = 2;

/** Generates a full month of plan cells from the config. Pure + deterministic. */
export function generateMonthPlan(config: AutoPlanConfig): PlanCell[] {
  const state = new Map(config.staff.map((s) => [s.code, { s1: 0, s2: 0, last: null as ShiftCode | null }]));
  const cells: PlanCell[] = [];

  for (const workDate of monthDates(config.month)) {
    const wd = weekday(workDate);
    const offStaff = config.staff.filter((s) => s.daysOff.includes(wd));
    let working = config.staff.filter((s) => !s.daysOff.includes(wd));

    // Guarantee ≥ 2 working: pull back the least-worked off-person(s) if short.
    if (working.length < MIN_STAFF_PER_DAY && offStaff.length > 0) {
      const need = MIN_STAFF_PER_DAY - working.length;
      const pulled = [...offStaff]
        .sort((a, b) => {
          const ta = state.get(a.code)!;
          const tb = state.get(b.code)!;
          return ta.s1 + ta.s2 - (tb.s1 + tb.s2);
        })
        .slice(0, need);
      working = [...working, ...pulled];
    }
    const pulledCodes = new Set(working.map((s) => s.code));

    // Assign each working person the opposite of their last shift (rotation); seed with
    // startShift or alternate bycolumn index on their first day.
    const assigns = working.map((s, index) => {
      const st = state.get(s.code)!;
      let shift: ShiftCode;
      if (st.last) shift = opposite(st.last);
      else if (s.startShift) shift = s.startShift;
      else shift = index % 2 === 0 ? "s1" : "s2";
      return { code: s.code, shift };
    });

    // Coverage: when ≥ 2 work, make sure both กะ1 and กะ2 appear. When forced to flip
    // someone, prefer a person already mid-rotation (last set) so a first-day seed
    // (e.g. "ICE starts กะ1") is preserved; among those, flip the one with the fewest
    // of the target shift (keeps the split balanced).
    const pickToFlip = (toShift: ShiftCode) => {
      const candidates = assigns.filter((a) => a.shift !== toShift);
      const rotating = candidates.filter((a) => state.get(a.code)!.last !== null);
      const pool = rotating.length ? rotating : candidates;
      return pool.reduce((m, a) => (state.get(a.code)![toShift] < state.get(m.code)![toShift] ? a : m));
    };
    if (assigns.length >= MIN_STAFF_PER_DAY) {
      if (!assigns.some((a) => a.shift === "s1")) pickToFlip("s1").shift = "s1";
      else if (!assigns.some((a) => a.shift === "s2")) pickToFlip("s2").shift = "s2";
    }

    for (const { code, shift } of assigns) {
      cells.push({ staffCode: code, workDate, assignment: shift, startTime: defaultShiftStart(shift) });
      const st = state.get(code)!;
      st[shift] += 1;
      st.last = shift;
    }
    // Everyone genuinely off today (not pulled back) → explicit OFF cell.
    for (const s of offStaff) {
      if (!pulledCodes.has(s.code)) cells.push({ staffCode: s.code, workDate, assignment: "off" });
    }
  }

  return cells;
}
