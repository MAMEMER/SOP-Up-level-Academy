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
