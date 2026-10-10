// งานแข่งร้านอื่น (/card-prices/events) — ข้อมูลมาจากบอทบน mini ที่อ่านโพสต์ประกาศงานในกลุ่ม FB
// แล้วเขียนลง Firestore competitor_events (+ doc _meta). เว็บนี้อ่านอย่างเดียว.
// ทุกช่องอาจหาย/เป็น null ได้ (บอทเดาจากโพสต์) — ทำความสะอาดที่นี่ที่เดียว แล้วหน้าเว็บเชื่อ type ได้.
//
// ไฟล์นี้เป็น logic ล้วน (มี test) — ฝั่ง server อยู่ competitor-events-server.ts

import { SPECIAL_DAYS, eventsOnDate, type BoardEvent, type GameKey, type SpecialDay } from "./activity-board.ts";

export type CompGame = "pokemon" | "lorcana" | "riftbound" | "onepiece" | "other";
export type CompEventType = "prerelease" | "tournament" | "weekly" | "league" | "other";

export type CompetitorEvent = {
  id: string;
  game: CompGame;
  title: string;
  shop: string;
  location: string;
  bkk: boolean;
  eventType: CompEventType;
  dates: string[];
  times: string;
  feeThb: number | null;
  feeText: string;
  seats: number | null;
  prizes: string;
  doorGift: string;
  registration: string;
  notes: string;
  postUrl: string;
  groupUrl: string;
  postedAt: string;
  author: string;
  ours: boolean;
  updatedAt: string;
};

export type CompetitorMeta = { updatedAt: string; count: number; windowDays: number };

const COMP_GAMES: CompGame[] = ["pokemon", "lorcana", "riftbound", "onepiece", "other"];
const EVENT_TYPES: CompEventType[] = ["prerelease", "tournament", "weekly", "league", "other"];

export const COMP_GAME_LABEL: Record<CompGame, string> = {
  pokemon: "Pokemon",
  lorcana: "Lorcana",
  riftbound: "Riftbound",
  onepiece: "One Piece",
  other: "อื่นๆ"
};

export const EVENT_TYPE_LABEL: Record<CompEventType, string> = {
  prerelease: "Pre-release",
  tournament: "ทัวร์นาเมนต์",
  weekly: "Weekly",
  league: "League",
  other: ""
};

/** ชิปกรองเกม — "อื่นๆ" รวม One Piece กับเกมที่บอทไม่รู้จัก */
export const GAME_FILTERS = [
  { key: "", label: "ทั้งหมด" },
  { key: "pokemon", label: "Pokemon" },
  { key: "lorcana", label: "Lorcana" },
  { key: "riftbound", label: "Riftbound" },
  { key: "other", label: "อื่นๆ" }
] as const;
export type GameFilter = (typeof GAME_FILTERS)[number]["key"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** ทำความสะอาด doc หนึ่งตัวจาก Firestore — คืน null ถ้าไม่ใช่ object */
export function sanitizeEvent(id: string, raw: unknown): CompetitorEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const game = COMP_GAMES.includes(r.game as CompGame) ? (r.game as CompGame) : "other";
  const eventType = EVENT_TYPES.includes(r.eventType as CompEventType) ? (r.eventType as CompEventType) : "other";
  const dates = Array.isArray(r.dates)
    ? [...new Set(r.dates.map((d) => str(d, 10)).filter((d) => ISO_DATE.test(d)))].sort()
    : [];
  const url = (v: unknown) => {
    const s = str(v, 600);
    return /^https?:\/\//i.test(s) ? s : "";
  };
  return {
    id: str(r.id, 120) || id,
    game,
    title: str(r.title, 200),
    shop: str(r.shop, 120),
    location: str(r.location, 200),
    bkk: r.bkk === true,
    eventType,
    dates,
    times: str(r.times, 120),
    feeThb: num(r.feeThb),
    feeText: str(r.feeText, 120),
    seats: num(r.seats),
    prizes: str(r.prizes, 600),
    doorGift: str(r.doorGift, 300),
    registration: str(r.registration, 300),
    notes: str(r.notes, 600),
    postUrl: url(r.postUrl),
    groupUrl: url(r.groupUrl),
    postedAt: str(r.postedAt, 40),
    author: str(r.author, 120),
    ours: r.ours === true,
    updatedAt: str(r.updatedAt, 40)
  };
}

export function feeLabel(e: Pick<CompetitorEvent, "feeThb" | "feeText">): string {
  if (typeof e.feeThb === "number") return e.feeThb === 0 ? "ไม่มีค่าสมัคร" : `฿${e.feeThb.toLocaleString("en-US")}`;
  return e.feeText;
}

const TH_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-10-17" → "ส. 17 ต.ค." */
export function thaiDateLabel(date: string): string {
  if (!ISO_DATE.test(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  return `${TH_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** วันนี้ตามเวลากรุงเทพ เป็น yyyy-mm-dd */
export function bangkokToday(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

// ---------- งานของร้านเรา + เช็คชนกัน ----------

/** เกมของบอทคู่แข่ง → เกมในตารางกิจกรรมของเรา */
const OUR_GAME: Partial<Record<CompGame, GameKey>> = { pokemon: "pkm", lorcana: "lor", riftbound: "rb" };

export type OurDay = { games: GameKey[]; titles: string[] };

/**
 * วันที่ร้านเรามีงาน = ตารางกิจกรรมรายสัปดาห์สองสาขา (sop_activity_board, หน้า /admin/activities)
 * + งานพิเศษ SPECIAL_DAYS (เช่น Grand Opening 17 ต.ค.). Open Play ไม่นับเป็น "งาน".
 */
export function ourEventsByDate(
  board: BoardEvent[],
  dates: string[],
  specials: SpecialDay[] = SPECIAL_DAYS
): Record<string, OurDay> {
  const out: Record<string, OurDay> = {};
  for (const date of new Set(dates)) {
    const games = new Set<GameKey>();
    const titles: string[] = [];
    for (const s of specials) {
      if (s.date !== date || s.closed) continue;
      titles.push(s.title);
      for (const g of s.games ?? []) games.add(g);
    }
    for (const e of eventsOnDate(board, date, specials)) {
      if (e.game === "open") continue;
      games.add(e.game);
      if (!titles.includes(e.title)) titles.push(e.title);
    }
    if (titles.length) out[date] = { games: [...games], titles };
  }
  return out;
}

export type Clash = "strong" | "soft" | null;

/** ชนกันในวันนั้น: เกมเดียวกัน = strong, เรามีงานเกมอื่น = soft */
export function clashOn(game: CompGame, ours: OurDay | undefined): Clash {
  if (!ours) return null;
  const mine = OUR_GAME[game];
  if (mine && ours.games.includes(mine)) return "strong";
  return "soft";
}

export function matchesFilter(e: CompetitorEvent, game: GameFilter, bkkOnly: boolean): boolean {
  if (e.ours) return false;
  if (bkkOnly && !e.bkk) return false;
  if (!game) return true;
  if (game === "other") return e.game === "other" || e.game === "onepiece";
  return e.game === game;
}

export type DateGroup = { date: string | null; label: string; events: CompetitorEvent[] };

/**
 * จัดกลุ่มตามวัน (เรียงวันใกล้สุดก่อน). งานหลายวัน (league) โผล่ทุกวันที่ยังไม่ผ่าน.
 * งานที่ทุกวันผ่านไปแล้วตัดทิ้ง · งานที่ไม่มีวันไปอยู่กลุ่มท้าย "ยังไม่ระบุวัน".
 */
export function groupByDate(events: CompetitorEvent[], today: string): DateGroup[] {
  const byDate = new Map<string, CompetitorEvent[]>();
  const undated: CompetitorEvent[] = [];
  for (const e of events) {
    if (e.ours) continue;
    if (!e.dates.length) {
      undated.push(e);
      continue;
    }
    for (const d of e.dates) {
      if (d < today) continue;
      byDate.set(d, [...(byDate.get(d) ?? []), e]);
    }
  }
  const byShop = (a: CompetitorEvent, b: CompetitorEvent) => a.shop.localeCompare(b.shop) || a.title.localeCompare(b.title);
  const groups: DateGroup[] = [...byDate.keys()]
    .sort()
    .map((date) => ({ date, label: thaiDateLabel(date), events: byDate.get(date)!.sort(byShop) }));
  if (undated.length) {
    groups.push({
      date: null,
      label: "ยังไม่ระบุวัน",
      events: undated.sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""))
    });
  }
  return groups;
}
