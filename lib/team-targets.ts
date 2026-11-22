/** Pure calculations for monthly team targets. Dates are calendar dates in Bangkok. */
export const GAMES = ["pokemon", "lorcana", "riftbound", "monsnatch"] as const;
export type Game = typeof GAMES[number];
export type TeamTargets = {
  revenueTarget: number;
  eventTargets: Record<Game, number>;
  budgetTarget: number;
  budgetActual?: number | null;
  poolPer10k: number;
  poolPerGame: number;
  passWeeks: number;
};
export type StoreNumbers = { group4?: number; byBranch?: Record<string, number> };

export function gameFor(value: string): Game | "other" {
  const s = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/pokemon|pokemom|gym|gbl|tactic[ -]?deck/.test(s)) return "pokemon";
  if (/lorcana/.test(s)) return "lorcana";
  if (/rift\s?bound|skirmish/.test(s)) return "riftbound";
  if (/monsnatch/.test(s)) return "monsnatch";
  return "other";
}

/** Monday key for a Bangkok calendar date, including partial weeks at month edges. */
export function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function monthWeeks(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return [...new Set(Array.from({ length: days }, (_, i) => weekKey(`${month}-${String(i + 1).padStart(2, "0")}`)))];
}
export type WeeklyEntries = Record<string, Partial<Record<Game, number>>>;
export function passedWeeks(weeks: string[], entries: WeeklyEntries, targets: Record<Game, number>): Record<Game, number> {
  return Object.fromEntries(GAMES.map(game => [game, targets[game] > 0 ? weeks.filter(w => (entries[w]?.[game] || 0) >= targets[game]).length : 0])) as Record<Game, number>;
}
export function group4Score(revenue: number, target: number, weeksPassed: number, weeksTotal: number, budgetTarget?: number, spend?: number): number | undefined {
  const scores: number[] = [];
  if (target > 0) scores.push(Math.max(0, Math.min(100, revenue / target * 100)));
  if (weeksTotal > 0) scores.push(Math.max(0, Math.min(100, weeksPassed / weeksTotal * 100)));
  if (budgetTarget && budgetTarget > 0 && spend != null) scores.push(Math.max(0, Math.min(100, 100 - Math.max(0, spend - budgetTarget) / budgetTarget * 100)));
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
}
export function incentivePool(revenue: number, targets: TeamTargets, passed: Record<Game, number>): number {
  const revenuePart = targets.revenueTarget > 0 ? Math.floor(Math.max(0, revenue - targets.revenueTarget) / 10000) * targets.poolPer10k : 0;
  return revenuePart + GAMES.filter(g => targets.eventTargets[g] > 0 && passed[g] >= targets.passWeeks).length * targets.poolPerGame;
}
export function splitPool(pool: number, staff: Array<{ code: string; hours: number }>): Array<{ code: string; hours: number; amount: number }> {
  const valid = staff.filter(s => Number.isFinite(s.hours) && s.hours > 0);
  const total = valid.reduce((sum, s) => sum + s.hours, 0);
  return valid.map(s => ({ ...s, amount: total ? pool * s.hours / total : 0 }));
}

/** A monthly share uses calendar days; unavailable days must be supplied from verified records. */
export function splitEligiblePool(pool: number, staff: Array<{ code: string; total: number | null; incentiveEligible: boolean; availableDays: number }>, daysInMonth: number) {
  if (!Number.isFinite(pool) || pool < 0 || !Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31) throw new Error("Invalid pool or month");
  if (new Set(staff.map(s => s.code)).size !== staff.length || staff.some(s => !Number.isInteger(s.availableDays) || s.availableDays < 0 || s.availableDays > daysInMonth)) throw new Error("Invalid staff availability");
  const eligible = staff.filter(s => s.total !== null && Number.isFinite(s.total) && s.total >= 90 && s.incentiveEligible && s.availableDays > 0);
  if (!eligible.length) return { shares: [], carriedOver: pool };
  const base = pool / eligible.length;
  const full = eligible.filter(s => s.availableDays === daysInMonth).length;
  const remainder = eligible.reduce((sum, s) => sum + base * (1 - s.availableDays / daysInMonth), 0);
  return {
    shares: eligible.map(s => ({ code: s.code, availableDays: s.availableDays, amount: base * s.availableDays / daysInMonth + (s.availableDays === daysInMonth && full ? remainder / full : 0) })),
    carriedOver: full ? 0 : remainder
  };
}

export type Product = { id?: string; name?: string; category?: string };
export type Transaction = { storeId?: string; transactionTime?: string; transactionType?: string; isCancelled?: boolean; total?: number; items?: Array<{ productId?: string; name?: string; quantity?: number; total?: number }> };
export type OnlinePayment = { status?: string; date: string; amount?: number; eventType?: string; source?: string };
export type TeamActuals = { revenue: { bangkae: number; senafest: number; online: number }; entries: WeeklyEntries };
const BRANCHES: Record<string, "bangkae" | "senafest"> = { "6a268170c008ab000760e21a": "bangkae", "6aaa02f0a568500007542756": "senafest" };
export function calculateActuals(month: string, transactions: Transaction[], products: Product[], payments: OnlinePayment[]): TeamActuals {
  const revenue = { bangkae: 0, senafest: 0, online: 0 };
  const entries: WeeklyEntries = {};
  const productMap = new Map(products.map(p => [p.id, p]));
  const add = (date: string, game: Game | "other", n: number) => {
    if (game === "other") return;
    const key = weekKey(date);
    const row = entries[key] ||= {};
    row[game] = (row[game] || 0) + n;
  };
  for (const tx of transactions) {
    const branch = BRANCHES[tx.storeId || ""];
    const ms = Date.parse(tx.transactionTime || "");
    if (!branch || tx.isCancelled || !Number.isFinite(ms)) continue;
    const date = new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
    if (!date.startsWith(month)) continue;
    if (!Array.isArray(tx.items)) throw new Error("Missing StoreHub transaction items");
    const sign = tx.transactionType === "Return" ? -1 : 1;
    let preorder = 0;
    for (const item of tx.items || []) {
      const p = productMap.get(item.productId);
      if (!p) throw new Error("Missing StoreHub product for transaction item");
      const category = (p?.category || "").trim().toLowerCase();
      if (category === "pre order") preorder += Number(item.total) || 0;
      const name = item.name || p?.name || "";
      if (category === "event" || /pre\s*release/i.test(name)) add(date, gameFor(name), sign * (Number(item.quantity) || 0));
    }
    revenue[branch] += sign * ((Number(tx.total) || 0) - preorder);
  }
  for (const payment of payments) {
    if (payment.status?.toLowerCase() !== "verified" || !payment.date.startsWith(month)) continue;
    revenue.online += Number(payment.amount) || 0;
    add(payment.date, gameFor(`${payment.eventType || ""} ${payment.source || ""}`), 1);
  }
  return { revenue, entries };
}
