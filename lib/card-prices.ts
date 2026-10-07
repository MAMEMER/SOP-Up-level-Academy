// ราคากลางการ์ด — ข้อมูลมาจากบอทไลน์บน mini (lineops.cardref) ที่อ่านโพสต์ซื้อขายในกลุ่ม FB
// แล้วเขียนลง Firestore card_ref_prices (chunk_000.. + _meta). เว็บนี้อ่านอย่างเดียว ยกเว้น:
//   card_price_feedback  พนักงานทักท้วง "ไม่ใช่ใบนี้ / น่าจะถูกกว่า / แพงกว่า / ถูกต้อง"
//   card_ref_overrides   เจ้าของยืนยันราคาร้าน (บอทดึงกลับไปตอบในไลน์ด้วย)
//   card_watch           สเกาต์: ให้ใครจับตาใบไหน — บอทเจอโพสต์ขายใบนั้นแล้วทักไลน์คนนั้น
// ไฟล์นี้เป็น logic ล้วน (มี test) — ฝั่ง server อยู่ card-prices-server.ts

export type PriceSample = { price: number; at: number; kind: string; seller: string; link: string; group: string };

export type RefRow = {
  id: string;
  key: string;
  game: string;
  name: string;
  aka: string;
  img: string;
  set: string;
  number: string;
  printing: boolean;
  lang: string;
  grade: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  low: number | null;
  high: number | null;
  n: number;
  buy: number | null;
  nbuy: number;
  trend: number | null;
  lastAt: number;
  usd: number | null;
  samples: PriceSample[];
};

export type RefMeta = { updatedAt: string; rows: number; windowDays: number; groups: number; usdThb: number };

export const VERDICTS = {
  wrong_card: "ไม่ใช่การ์ดใบนี้",
  too_high: "แพงไป ควรถูกกว่านี้",
  too_low: "ถูกไป ควรแพงกว่านี้",
  ok: "ราคานี้ถูกต้อง"
} as const;
export type Verdict = keyof typeof VERDICTS;

export type PriceFeedback = {
  id: string;
  rowId: string;
  key: string;
  name: string;
  verdict: Verdict;
  suggest: number | null;
  note: string;
  byCode: string;
  byName: string;
  at: string;
  status: "open" | "closed";
};

export type PriceOverride = { id: string; key: string; name: string; price: number; note: string; byName: string; at: string };

export type CardWatch = {
  id: string;
  key: string;
  query: string;
  game: string;
  name: string;
  maxPrice: number | null;
  staffCode: string;
  staffName: string;
  createdByName: string;
  createdAt: string;
  active: boolean;
  hits: number;
  lastHitAt: string;
  lastHit: { price: number; link: string; seller: string } | null;
};

export const GAMES = [
  { key: "", label: "ทุกเกม" },
  { key: "pokemon", label: "Pokemon" },
  { key: "lorcana", label: "Lorcana" },
  { key: "riftbound", label: "Riftbound" }
] as const;

export function gameLabel(game: string): string {
  return GAMES.find((g) => g.key === game)?.label ?? game;
}

export function confidence(n: number): { label: string; tone: "good" | "mid" | "low" } {
  if (n >= 4) return { label: "มั่นใจ", tone: "good" };
  if (n >= 2) return { label: "พอใช้", tone: "mid" };
  return { label: "ข้อมูลน้อย", tone: "low" };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** ค้นด้วยชื่อ (อังกฤษ/ไทย) รหัสเซ็ต หรือเลขการ์ด "201/165" */
export function searchRows(rows: RefRow[], query: string, game = ""): RefRow[] {
  const q = norm(query);
  const numMatch = q.match(/(\d{1,4})\s*\/\s*\d{1,4}/);
  const num = numMatch ? String(Number(numMatch[1])) : "";
  const words = q.replace(/\d{1,4}\s*\/\s*\d{1,4}/, " ").split(" ").filter(Boolean);
  return rows.filter((row) => {
    if (game && row.game !== game) return false;
    if (num && row.number !== num) return false;
    if (!words.length) return true;
    const hay = norm(`${row.name} ${row.aka} ${row.set} ${row.number} ${row.lang} ${row.grade}`);
    return words.every((w) => hay.includes(w));
  });
}

export type FeedbackSummary = { open: number; byVerdict: Partial<Record<Verdict, number>>; suggestMedian: number | null };

export function summarize(feedback: PriceFeedback[]): FeedbackSummary {
  const open = feedback.filter((f) => f.status === "open");
  const byVerdict: Partial<Record<Verdict, number>> = {};
  for (const f of open) byVerdict[f.verdict] = (byVerdict[f.verdict] ?? 0) + 1;
  const prices = open.map((f) => f.suggest).filter((p): p is number => typeof p === "number" && p > 0).sort((a, b) => a - b);
  const suggestMedian = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  return { open: open.length, byVerdict, suggestMedian };
}

export type SortKey = "sellers" | "price" | "recent" | "flagged";

export function sortRows(rows: RefRow[], sort: SortKey, flagged: Map<string, number>): RefRow[] {
  const copy = [...rows];
  if (sort === "price") return copy.sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
  if (sort === "recent") return copy.sort((a, b) => b.lastAt - a.lastAt);
  if (sort === "flagged") return copy.sort((a, b) => (flagged.get(b.id) ?? 0) - (flagged.get(a.id) ?? 0) || b.n - a.n);
  return copy.sort((a, b) => b.n - a.n || (b.median ?? 0) - (a.median ?? 0));
}

/** ตรวจ input ของฟอร์มทักท้วง — คืนข้อความผิดพลาด หรือ "" ถ้าผ่าน */
export function feedbackError(verdict: string, suggest: unknown): string {
  if (!(verdict in VERDICTS)) return "เลือกก่อนว่าราคานี้เป็นยังไง";
  if (suggest !== null && suggest !== undefined && suggest !== "") {
    const n = Number(suggest);
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return "ราคาที่เสนอต้องเป็นตัวเลขบาท";
  }
  if ((verdict === "too_high" || verdict === "too_low") && (suggest === null || suggest === undefined || suggest === ""))
    return "ใส่ราคาที่คิดว่าควรเป็นด้วย";
  return "";
}

export function baht(n: number | null | undefined): string {
  return typeof n === "number" ? `${n.toLocaleString("th-TH")}฿` : "–";
}
