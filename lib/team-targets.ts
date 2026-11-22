/** Pure calculations for monthly team targets. Dates are calendar dates in Bangkok. */
export const GAMES = ["pokemon", "lorcana", "riftbound", "monsnatch"] as const;
export type Game = typeof GAMES[number];
export type HeroProduct = { name: string; productIds: string[]; unitTarget: number; poolBonus: number };
export type TeamTargets = {
  heroProducts?: HeroProduct[];
  revenueTarget: number;
  targetBasis?: "store_ex_preorder" | "product_only";
  eventTargets: Record<Game, number>;
  budgetTarget: number;
  budgetActual?: number | null;
  poolRevenuePct: number;
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
export function incentivePool(revenue: number, targets: TeamTargets, passed: Record<Game, number>, heroUnits: number[] = []): number {
  const revenuePart = targets.revenueTarget > 0 ? Math.max(0, revenue - targets.revenueTarget) * (targets.poolRevenuePct ?? 10) / 100 : 0;
  return (targets.heroProducts || []).reduce((sum, hero, i) => sum + (hero.unitTarget > 0 && (heroUnits[i] || 0) >= hero.unitTarget ? hero.poolBonus : 0), 0) + revenuePart + GAMES.filter(g => targets.eventTargets[g] > 0 && passed[g] >= targets.passWeeks).length * targets.poolPerGame;
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

export type Product = { id?: string; name?: string; category?: string; unitPrice?: number; priceType?: string };
export type Transaction = { employeeId?: string; storeId?: string; transactionTime?: string; transactionType?: string; status?: string; isCancelled?: boolean; total?: number; items?: Array<{ productId?: string; name?: string; quantity?: number; total?: number }> };
export type OnlineOrder = { status?: string; slipStatus?: string; date: string; total?: number; items?: Array<{ name?: string; total?: number }> };
export type OnlinePayment = { status?: string; date: string; amount?: number; eventType?: string; source?: string };
export type TeamActuals = { revenue: { bangkae: number; senafest: number; online: number }; entries: WeeklyEntries };
const BRANCHES: Record<string, "bangkae" | "senafest"> = { "6a268170c008ab000760e21a": "bangkae", "6aaa02f0a568500007542756": "senafest" };
export function calculateActuals(month: string, transactions: Transaction[], products: Product[], payments: OnlinePayment[], orders: OnlineOrder[] = []): TeamActuals {
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
    if (!branch || tx.isCancelled || String(tx.status || "").toLowerCase() === "cancelled" || !Number.isFinite(ms)) continue;
    const date = new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
    if (!date.startsWith(month)) continue;
    if (!Array.isArray(tx.items)) throw new Error("Missing StoreHub transaction items");
    const sign = tx.transactionType === "Return" ? -1 : 1;
    let excluded = 0;
    for (const item of tx.items || []) {
      const p = productMap.get(item.productId);
      if (!p) throw new Error("Missing StoreHub product for transaction item");
      const category = (p?.category || "").trim().toLowerCase();
      if (!Number.isFinite(item.total)) throw new Error("Incomplete product data");
      const kind = classifySaleProduct(p);
      if (kind === "preorder" || kind === "event") excluded += item.total!;
      const name = item.name || p?.name || "";
      if (category === "event" || /pre\s*release/i.test(name)) add(date, gameFor(name), sign * (Number(item.quantity) || 0));
    }
    revenue[branch] += sign * ((Number(tx.total) || 0) - excluded);
  }
  for (const payment of payments) {
    if (payment.status?.toLowerCase() !== "verified" || !payment.date.startsWith(month)) continue;
    add(payment.date, gameFor(`${payment.eventType || ""} ${payment.source || ""}`), 1);
  }
  revenue.online = onlineProductSales(month, orders);
  return { revenue, entries };
}

export function classifySaleProduct(product: Product): "preorder" | "event" | "membership" | "open_price" | "product" {
  const name = product.name || "", category = (product.category || "").trim().toLowerCase();
  if (category === "pre order" || /pre ?-?order|พรี/i.test(name)) return "preorder";
  if (category === "event" || /pre release|event|tournam|gym|ค่าบริการบอร์ดเกม|road to/i.test(name)) return "event";
  if (name.includes("สมัคร สมาชิก")) return "membership";
  if (name.includes("ขายได้ทุกอย่าง")) return "open_price";
  return "product";
}
export function onlineProductSales(month: string, orders: OnlineOrder[], today = `${month}-31`): number {
  return orders.reduce((sum, order) => {
    if (order.status === "rejected" || (order.status !== "confirmed" && order.slipStatus !== "paid") || !order.date.startsWith(month) || order.date > today) return sum;
    if (!Number.isFinite(order.total)) throw new Error("Incomplete online order");
    if (order.items?.some(item => ["preorder", "event"].includes(classifySaleProduct({ name: item.name })))) {
      if (order.items.some(item => !Number.isFinite(item.total))) throw new Error("Incomplete online order items");
      return sum + order.total! - order.items.filter(item => ["preorder", "event"].includes(classifySaleProduct({ name: item.name }))).reduce((n, item) => n + item.total!, 0);
    }
    return sum + order.total!;
  }, 0);
}
export function pace(amount: number, target: number, day: number, days: number) {
  const remaining = Math.max(0, target - amount), remainingDays = Math.max(0, days - day);
  return { percent: target > 0 ? amount / target * 100 : null, remaining, remainingDays, neededPerDay: remainingDays ? remaining / remainingDays : null, forecast: day > 0 ? amount / day * days : 0 };
}
export function salesProgress(month: string, today: string, transactions: Transaction[], products: Product[], payments: OnlinePayment[], orders: OnlineOrder[] = []) {
  const catalog = new Map(products.map(p => [p.id, p]));
  const branches = { bangkae: 0, senafest: 0, online: 0 };
  const daily: Record<string, { product: number; event: number; store: number }> = {};
  let product = 0, event = 0, store = 0;
  const add = (date: string, branch: keyof typeof branches, p: number, e: number, total: number) => {
    const row = daily[date] ||= { product: 0, event: 0, store: 0 };
    row.product += p; row.event += e; row.store += total;
    product += p; event += e; store += total; branches[branch] += total;
  };
  for (const tx of transactions) {
    const branch = BRANCHES[tx.storeId || ""], ms = Date.parse(tx.transactionTime || "");
    if (!branch || tx.isCancelled || String(tx.status || "").toLowerCase() === "cancelled" || !Number.isFinite(ms)) continue;
    const date = new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
    if (!date.startsWith(month) || date > today) continue;
    if (!Array.isArray(tx.items) || !Number.isFinite(tx.total)) throw new Error("Incomplete transaction");
    const sign = tx.transactionType === "Return" ? -1 : 1;
    let excluded = 0, preorder = 0, events = 0;
    for (const item of tx.items) {
      const p = catalog.get(item.productId);
      if (!p || !Number.isFinite(item.total)) throw new Error("Incomplete product data");
      const kind = classifySaleProduct(p), amount = Math.max(0, item.total!);
      if (kind === "preorder" || kind === "event") excluded += amount;
      if (kind === "preorder") preorder += amount;
      if (kind === "event") events += amount;
    }
    add(date, branch, sign * Math.max(0, tx.total! - excluded), sign * events, sign * Math.max(0, tx.total! - preorder));
  }
  for (const payment of payments) if (payment.status?.toLowerCase() === "verified" && payment.date.startsWith(month) && payment.date <= today) {
    const amount = Number(payment.amount) || 0; add(payment.date, "online", 0, amount, amount);
  }
  for (const order of orders) {
    const amount = onlineProductSales(month, [order], today);
    if (amount) add(order.date, "online", amount, 0, amount);
  }
  return { product, event, store, branches, daily };
}

export function heroProductActuals(month: string, today: string, transactions: Transaction[], heroes: HeroProduct[]) {
  return heroes.map(hero => {
    let units = 0;
    const staff: Record<string, number> = {};
    for (const tx of transactions) {
      const ms = Date.parse(tx.transactionTime || "");
      if (tx.isCancelled || String(tx.status || "").toLowerCase() === "cancelled" || !Number.isFinite(ms)) continue;
      const date = new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
      if (!date.startsWith(month) || date > today) continue;
      if (!Array.isArray(tx.items)) throw new Error("Missing StoreHub transaction items");
      const sign = tx.transactionType === "Return" ? -1 : 1;
      for (const item of tx.items) if (hero.productIds.includes(item.productId || "")) {
        if (!Number.isFinite(item.quantity)) throw new Error("Missing StoreHub item quantity");
        const quantity = sign * item.quantity!;
        units += quantity;
        const key = tx.employeeId || "unknown";
        staff[key] = (staff[key] || 0) + quantity;
      }
    }
    return { units, staff };
  });
}
