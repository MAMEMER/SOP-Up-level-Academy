// Activity presets + public holidays for the shift planner. Lets the owner drop a
// recurring event ("ทุกอังคาร = Pokémon 19:00") in one click, shows a card-game logo on
// activity days for quick scanning, and marks Thai public holidays.

export type GamePreset = {
  key: string;
  label: string;
  logo: string; // /games/*.png
  defaultTime: string; // HH:MM
};

export const gamePresets: GamePreset[] = [
  { key: "pokemon", label: "Pokémon", logo: "/games/pokemon.png", defaultTime: "19:00" },
  { key: "lorcana", label: "Lorcana", logo: "/games/lorcana.png", defaultTime: "19:00" },
  { key: "riftbound", label: "Riftbound", logo: "/games/riftbound.png", defaultTime: "19:00" },
  { key: "eidolon", label: "Eidolon", logo: "/games/eidolon.png", defaultTime: "19:00" }
];

export function gamePreset(key: string | undefined): GamePreset | undefined {
  return key ? gamePresets.find((g) => g.key === key) : undefined;
}

// Recurring WORK tasks (Stock งานประจำ) the owner can drop onto the shift grid the same
// way as a game event. Unlike a game chip, a task chip links to its checklist page so the
// checklist "ขึ้นในวันที่กำหนด" — assign it on a date, staff open the checklist from there.
// The task key is stored in DayActivity.game (shared slot) — taskPreset() resolves it.
export type TaskPreset = {
  key: string;
  label: string;
  badge: string; // short text badge (editorial, no logo image)
  defaultTime: string; // HH:MM or "" (stock work has no fixed time)
  href: string; // checklist link shown on the assigned date
  cadence: "weekly" | "monthly";
  /** work-record scope the task's checklist saves under (used to tell "ส่งแล้ว" apart) */
  recordScope: "weekly" | "monthly";
};

export const taskPresets: TaskPreset[] = [
  {
    key: "stock-sleeve-work",
    label: "Stock Sleeve/อุปกรณ์",
    badge: "SL",
    defaultTime: "",
    href: "/checklist-weekly#stock-sleeve-work",
    cadence: "weekly",
    recordScope: "weekly"
  },
  {
    key: "stock-single-card-work",
    label: "Stock Single card",
    badge: "SC",
    defaultTime: "",
    href: "/checklist-monthly#stock-single-card-work",
    cadence: "monthly",
    // the Single card checklist saves under scope "monthly" but keys by ISO week
    recordScope: "monthly"
  }
];

export function taskPreset(key: string | undefined): TaskPreset | undefined {
  return key ? taskPresets.find((t) => t.key === key) : undefined;
}

/** Clamp a day-of-month to a valid date string in the given month (handles 28–31). */
export function dateInMonth(month: string, day: number): string {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

// Fixed-date Thai public holidays 2026 (solar dates — 100% correct). Lunar Buddhist
// days (มาฆ/วิสาข/อาสาฬห) shift yearly and can be added by hand on the grid.
export const thaiHolidays2026: Record<string, string> = {
  "2026-01-01": "วันขึ้นปีใหม่",
  "2026-04-06": "วันจักรี",
  "2026-04-13": "สงกรานต์",
  "2026-04-14": "สงกรานต์",
  "2026-04-15": "สงกรานต์",
  "2026-05-01": "วันแรงงาน",
  "2026-05-04": "วันฉัตรมงคล",
  "2026-06-03": "วันเฉลิมฯ พระราชินี",
  "2026-07-28": "วันเฉลิมฯ ร.10",
  "2026-08-12": "วันแม่แห่งชาติ",
  "2026-10-13": "วันนวมินทรมหาราช",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-05": "วันพ่อแห่งชาติ",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี"
};

export function holidayName(workDate: string): string | undefined {
  return thaiHolidays2026[workDate];
}

/** All YYYY-MM-DD in a month whose weekday matches (0=Sun … 6=Sat). */
export function datesForWeekday(month: string, weekday: number): string[] {
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d += 1) {
    const workDate = `${month}-${String(d).padStart(2, "0")}`;
    if (new Date(`${workDate}T12:00:00+07:00`).getUTCDay() === weekday) out.push(workDate);
  }
  return out;
}
