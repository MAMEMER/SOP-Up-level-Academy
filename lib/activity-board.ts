// ตารางกิจกรรมรายสัปดาห์ของเจ้าของร้าน (/admin/activities) — บางแค × เสนาเฟสต์
//
// ย้ายมาจากบอร์ด Weekly สองสาขาที่แชมป์ร่างไว้ใน artifact (4 ต.ค. 2026). ตารางกิจกรรม
// เป็น "แม่แบบรายสัปดาห์" (จันทร์–อาทิตย์ ซ้ำทุกสัปดาห์) เก็บใน doc เดียว ส่วน "ใครลงที่ไหน"
// อ่านจากตารางกะจริง (schedule_shifts) ของสัปดาห์ที่เปิดดู — สองอย่างนี้วางคู่กันในช่องเดียว
// เพื่อให้เห็นทันทีว่าวันที่มีกิจกรรม มีคนอยู่สาขานั้นจนจบงานหรือเปล่า.
//
// ไฟล์นี้เป็น logic ล้วน (ไม่แตะ Firestore) — ใช้ได้ทั้ง server, client และ test.

export type BoardBranch = "bangkae" | "senafest";
export type GameKey = "pkm" | "lor" | "rb" | "eid" | "tac" | "cas" | "open";

export type BoardEvent = {
  id: string;
  branch: BoardBranch;
  /** 0 = จันทร์ … 6 = อาทิตย์ */
  day: number;
  game: GameKey;
  title: string;
  /** "HH:MM" */
  start: string;
  /** ชั่วโมง; 0 = ทั้งวัน (เช่น Open Play) */
  dur: number;
  fee: number;
  cap: number;
  note?: string;
};

export type StaffOnDay = {
  code: string;
  name: string;
  shift: "s1" | "s2";
  start: string;
  end: string;
};

/** สาขา → คนที่เข้ากะวันนั้น (เฉพาะ s1/s2 — วันหยุด/ลา ไม่นับ) */
export type DayStaff = Record<BoardBranch, StaffOnDay[]>;

export const BOARD_BRANCHES: { key: BoardBranch; name: string; short: string }[] = [
  { key: "bangkae", name: "บางแค", short: "บค" },
  { key: "senafest", name: "เสนาเฟสต์", short: "สฟ" }
];

export const BOARD_DAYS = [
  { th: "จันทร์", en: "Mon" },
  { th: "อังคาร", en: "Tue" },
  { th: "พุธ", en: "Wed" },
  { th: "พฤหัส", en: "Thu" },
  { th: "ศุกร์", en: "Fri" },
  { th: "เสาร์", en: "Sat" },
  { th: "อาทิตย์", en: "Sun" }
];

export const GAMES: Record<GameKey, { name: string }> = {
  pkm: { name: "Pokémon" },
  lor: { name: "Lorcana" },
  rb: { name: "Riftbound" },
  eid: { name: "Eidolon" },
  tac: { name: "Tactic Deck" },
  cas: { name: "สอนเล่น / Casual" },
  open: { name: "Open Play" }
};

export const OPEN_MIN = 10 * 60;
export const CLOSE_MIN = 22 * 60;

// ตั้งต้น = บอร์ดที่แชมป์ร่างไว้ (บางแค = ปฏิทินจริงบน uplevelguild.com/calendar 28 ก.ย. 2569,
// เสนาเฟสต์ = ร่าง v1). Tactic Deck จบแคมเปญ 4 ต.ค. แต่คงไว้ให้แชมป์ลบเอง.
export const DEFAULT_BOARD: BoardEvent[] = [
  { id: "b1", branch: "bangkae", day: 1, game: "pkm", title: "Gym Battle", start: "19:00", dur: 3, fee: 220, cap: 16 },
  { id: "b2", branch: "bangkae", day: 2, game: "lor", title: "Lorcana Core", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "b3", branch: "bangkae", day: 2, game: "rb", title: "Riftbound", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "b4", branch: "bangkae", day: 3, game: "eid", title: "Eidolon", start: "19:00", dur: 3, fee: 150, cap: 8 },
  { id: "b5", branch: "bangkae", day: 3, game: "lor", title: "Lorcana Core", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "b6", branch: "bangkae", day: 3, game: "tac", title: "Tactic Deck", start: "19:00", dur: 2, fee: 50, cap: 16, note: "จบ 4 ต.ค." },
  { id: "b7", branch: "bangkae", day: 4, game: "pkm", title: "Gym Battle", start: "19:00", dur: 3, fee: 220, cap: 16 },
  { id: "b8", branch: "bangkae", day: 4, game: "lor", title: "Lorcana Core", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "b9", branch: "bangkae", day: 5, game: "lor", title: "Lorcana Core", start: "13:00", dur: 3, fee: 250, cap: 16 },
  { id: "b10", branch: "bangkae", day: 5, game: "tac", title: "Tactic Deck", start: "13:00", dur: 2, fee: 50, cap: 16, note: "จบ 4 ต.ค." },
  { id: "b11", branch: "bangkae", day: 5, game: "pkm", title: "Gym Battle", start: "16:00", dur: 3, fee: 220, cap: 16 },
  { id: "b12", branch: "bangkae", day: 6, game: "lor", title: "Lorcana Pack Rush", start: "13:00", dur: 4, fee: 450, cap: 16 },
  { id: "b13", branch: "bangkae", day: 6, game: "tac", title: "Tactic Deck 2 รอบ", start: "13:00", dur: 4.5, fee: 50, cap: 16, note: "จบ 4 ต.ค." },
  { id: "s1", branch: "senafest", day: 0, game: "lor", title: "Lorcana Core", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "s2", branch: "senafest", day: 1, game: "rb", title: "Riftbound", start: "19:00", dur: 3, fee: 250, cap: 16 },
  { id: "s3", branch: "senafest", day: 2, game: "pkm", title: "Pokémon Standard", start: "19:00", dur: 3, fee: 220, cap: 16 },
  { id: "s4", branch: "senafest", day: 3, game: "cas", title: "Casual Night สอนเล่น", start: "19:00", dur: 3, fee: 100, cap: 24 },
  { id: "s5", branch: "senafest", day: 4, game: "open", title: "Open Play", start: "10:00", dur: 0, fee: 0, cap: 0 },
  { id: "s6", branch: "senafest", day: 5, game: "rb", title: "Riftbound", start: "13:00", dur: 3, fee: 250, cap: 16 },
  { id: "s7", branch: "senafest", day: 5, game: "lor", title: "Lorcana Pack Rush", start: "17:30", dur: 4, fee: 450, cap: 16 },
  { id: "s8", branch: "senafest", day: 6, game: "pkm", title: "Pokémon Standard", start: "13:00", dur: 3, fee: 220, cap: 16 }
];

export function toMinutes(time: string): number {
  const [h, m] = String(time).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** [เริ่ม, จบ] เป็นนาที — งาน "ทั้งวัน" กินเวลาเปิด–ปิดร้าน */
export function eventSpan(e: Pick<BoardEvent, "start" | "dur">): [number, number] {
  return e.dur ? [toMinutes(e.start), toMinutes(e.start) + e.dur * 60] : [OPEN_MIN, CLOSE_MIN];
}

export function sortEvents(list: BoardEvent[]): BoardEvent[] {
  return list.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.title.localeCompare(b.title));
}

const GAME_KEYS = Object.keys(GAMES) as GameKey[];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ทำความสะอาดข้อมูลจาก client ก่อนเก็บ — ตัดช่องที่พัง ไม่ throw ทั้งก้อน */
export function sanitizeBoard(input: unknown): BoardEvent[] | null {
  if (!Array.isArray(input) || input.length > 200) return null;
  const out: BoardEvent[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const branch = r.branch === "bangkae" || r.branch === "senafest" ? r.branch : null;
    const day = Number(r.day);
    const game = GAME_KEYS.includes(r.game as GameKey) ? (r.game as GameKey) : null;
    const start = typeof r.start === "string" && TIME_RE.test(r.start) ? r.start : null;
    if (!id || seen.has(id) || !branch || !game || !start || !Number.isInteger(day) || day < 0 || day > 6) continue;
    seen.add(id);
    const num = (v: unknown, max: number) => Math.min(max, Math.max(0, Number(v) || 0));
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 40) : GAMES[game].name;
    const note = typeof r.note === "string" ? r.note.trim().slice(0, 40) : "";
    out.push({ id, branch, day, game, title, start, dur: num(r.dur, 12), fee: num(r.fee, 100000), cap: num(r.cap, 500), ...(note ? { note } : {}) });
  }
  return out;
}

export type DayWarning = { level: "red" | "amber" | "info"; text: string };

/**
 * คำเตือนของวันนั้น + ธงต่อการ์ด:
 *  - เกมเดียวกันทั้งสองสาขาเวลาชนกัน (แดง) / แค่วันเดียวกัน (เหลือง — อาจแบ่งคน)
 *  - งานจบหลังร้านปิด 22:00 (แดง)
 *  - ในสาขาเดียวมีงานซ้อนเวลา (เทา — แบ่งโต๊ะ)
 *  - มีกิจกรรมแต่ไม่มีใครเข้ากะสาขานั้น / ไม่มีใครอยู่ถึงงานจบ (แดง) — ใช้เมื่อมีตารางกะของวันนั้น
 */
export function dayWarnings(
  events: BoardEvent[],
  day: number,
  staff?: DayStaff | null
): { warnings: DayWarning[]; flags: Record<string, "bad" | "meh"> } {
  const warnings: DayWarning[] = [];
  const flags: Record<string, "bad" | "meh"> = {};
  const list = events.filter((e) => e.day === day);
  const competitive = (br: BoardBranch) => list.filter((e) => e.branch === br && e.game !== "open" && e.game !== "cas");
  const seen = new Set<string>();

  for (const a of competitive("bangkae")) {
    for (const b of competitive("senafest")) {
      if (a.game !== b.game) continue;
      const [a1, a2] = eventSpan(a);
      const [b1, b2] = eventSpan(b);
      const overlap = a1 < b2 && b1 < a2;
      for (const id of [a.id, b.id]) flags[id] = overlap || flags[id] === "bad" ? "bad" : "meh";
      const key = a.game + (overlap ? "r" : "a");
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push(
        overlap
          ? { level: "red", text: `${GAMES[a.game].name} ชนเวลากันสองสาขา` }
          : { level: "amber", text: `${GAMES[a.game].name} มีทั้งสองสาขาวันนี้ อาจแบ่งคน` }
      );
    }
  }

  for (const br of BOARD_BRANCHES) {
    const mine = list.filter((e) => e.branch === br.key && e.game !== "open");
    for (const e of mine) {
      if (eventSpan(e)[1] > CLOSE_MIN) {
        flags[e.id] = "bad";
        warnings.push({ level: "red", text: `${br.short} ${e.title} จบหลัง 22:00` });
      }
    }
    let overlapping = false;
    for (let i = 0; i < mine.length; i++)
      for (let j = i + 1; j < mine.length; j++) {
        const [a1, a2] = eventSpan(mine[i]);
        const [b1, b2] = eventSpan(mine[j]);
        if (a1 < b2 && b1 < a2) overlapping = true;
      }
    if (overlapping) warnings.push({ level: "info", text: `${br.short} มีงานเวลาซ้อนกัน แบ่งโต๊ะ` });

    // คนคุมงาน — เทียบเฉพาะเมื่อวันนั้นมีตารางกะของสาขานี้ (undefined = ไม่รู้ ไม่เตือน)
    const people = staff?.[br.key];
    if (!people || !mine.length) continue;
    const timed = mine.filter((e) => e.dur > 0);
    if (!people.length) {
      warnings.push({ level: "red", text: `${br.short} มีกิจกรรมแต่ไม่มีคนเข้ากะ` });
      continue;
    }
    const lastEnd = Math.max(...people.map((p) => toMinutes(p.end) || 24 * 60));
    const latest = timed.reduce((m, e) => Math.max(m, eventSpan(e)[1]), 0);
    if (latest > lastEnd) warnings.push({ level: "red", text: `${br.short} ไม่มีคนอยู่ถึง ${fromMinutes(latest)} (คนสุดท้ายออก ${fromMinutes(lastEnd)})` });
  }

  return { warnings, flags };
}

/** "YYYY-MM-DD" ของวันจันทร์ในสัปดาห์ของวันที่ให้มา (ปฏิทิน ไม่สน timezone) */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 7 วันของสัปดาห์ เริ่มวันจันทร์ */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// ---------- มุมมองปฏิทินรายเดือน ----------

/** โลโก้เกมจริง (public/games) — เกมที่ไม่มีโลโก้ใช้จุดสีแทน */
export const GAME_LOGOS: Partial<Record<GameKey, string>> = {
  pkm: "/games/pokemon.png",
  lor: "/games/lorcana.png",
  rb: "/games/riftbound.png",
  eid: "/games/eidolon.png"
};

/** งานพิเศษรายวัน (ไม่ซ้ำทุกสัปดาห์). replacesWeekly = วันนั้นสาขานั้นงดกิจกรรมประจำสัปดาห์ */
export type SpecialDay = {
  date: string;
  branch: BoardBranch;
  title: string;
  time: string;
  detail?: string;
  replacesWeekly?: boolean;
  /** สาขาปิดทั้งวัน (ไม่ใช่งาน) — หน้าเว็บแสดงเป็นป้ายปิด */
  closed?: boolean;
  href?: string;
};

export const SPECIAL_DAYS: SpecialDay[] = [
  {
    date: "2026-10-02",
    branch: "senafest",
    title: "Soft Opening เสนาเฟสต์",
    time: "19:00",
    detail: "Gym Battle + Riftbound",
    replacesWeekly: true
  },
  {
    date: "2026-10-17",
    branch: "senafest",
    title: "Grand Opening",
    time: "10:00–22:00",
    detail: "แข่ง PKM · Lorcana · Riftbound เกมละ 64 ที่ · Pre-release Hyperia City · Lucky Draw",
    replacesWeekly: true,
    href: "https://uplevelguild.com/grand-opening"
  },
  {
    // แชมป์ 6 ต.ค.: วันนี้บางแคปิด ทุกกิจกรรมไปรวมที่ Grand Opening
    date: "2026-10-17",
    branch: "bangkae",
    title: "บางแคปิด 1 วัน",
    time: "ทั้งวัน",
    detail: "ทุกกิจกรรมย้ายไปรวมที่ Grand Opening สาขาเสนาเฟสต์",
    replacesWeekly: true,
    closed: true,
    href: "https://uplevelguild.com/grand-opening"
  }
];

/** สาขาเสนาเฟสต์เริ่มมีกิจกรรมประจำสัปดาห์วันนี้ (เปิดสาขา 2 ต.ค. 2026) */
export const BRANCH_START: Partial<Record<BoardBranch, string>> = { senafest: "2026-10-02" };

export type MonthDay = {
  date: string;
  day: number; // 0 = จันทร์
  inMonth: boolean;
  events: BoardEvent[];
  specials: SpecialDay[];
};

/** 0 = จันทร์ … 6 = อาทิตย์ */
export function boardDayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** "YYYY-MM" เลื่อนไป n เดือน */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** กิจกรรมของวันหนึ่ง = แม่แบบรายสัปดาห์ของวันนั้น − สาขาที่ยังไม่เปิด − สาขาที่มีงานพิเศษแทน */
export function eventsOnDate(events: BoardEvent[], date: string, specials: SpecialDay[] = SPECIAL_DAYS): BoardEvent[] {
  const day = boardDayOf(date);
  const replaced = new Set(specials.filter((s) => s.date === date && s.replacesWeekly).map((s) => s.branch));
  return sortEvents(
    events.filter((e) => {
      if (e.day !== day || replaced.has(e.branch)) return false;
      const start = BRANCH_START[e.branch];
      return !start || date >= start;
    })
  );
}

/** ช่องปฏิทินทั้งเดือน เริ่มวันจันทร์ เติมวันของเดือนก่อน/หลังให้ครบสัปดาห์ */
export function monthGrid(events: BoardEvent[], month: string, specials: SpecialDay[] = SPECIAL_DAYS): MonthDay[] {
  const first = `${month}-01`;
  const start = mondayOf(first);
  const lastDate = addDays(`${addMonths(month, 1)}-01`, -1);
  const end = addDays(mondayOf(lastDate), 6);
  const out: MonthDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const inMonth = d.startsWith(month);
    out.push({
      date: d,
      day: boardDayOf(d),
      inMonth,
      events: inMonth ? eventsOnDate(events, d, specials) : [],
      specials: inMonth ? specials.filter((s) => s.date === d) : []
    });
  }
  return out;
}
