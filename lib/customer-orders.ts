// "ออเดอร์ลูกค้า" — ออเดอร์ทุกช่องทางในที่เดียว: ร้านออนไลน์, พรีออเดอร์ (Set 14, Bundle),
// Pre-release และพรีออเดอร์ที่อยู่ในชีต (MA6, Lorcana 13, Mega Tactic).
//
// ปัญหาที่หน้านี้แก้: แอดมินหาไม่เจอว่าออเดอร์อยู่ไหน จ่ายหรือยัง ส่ง/รับของหรือยัง เพราะแต่ละ
// ช่องทางเก็บคนละที่ และการ "ลูกค้ามารับแล้ว" เคยจดแบบเขียนทับในชีตคนละคอลัมน์.
// ไฟล์นี้เป็น logic ล้วน (ไม่มี I/O): แปลงข้อมูลดิบแต่ละแหล่งให้เป็นแถวรูปเดียวกัน.
//
// กติกา:
//  - ไม่เขียนกลับไปที่ต้นทาง (ชีต/ออเดอร์เว็บ) — การส่งมอบที่พนักงานกดเก็บใน `sop_order_fulfillment`
//    ของ SOP เอง และ "ที่พนักงานกด" ชนะ "ที่เดาจากชีต" เสมอ
//  - ร้านออนไลน์มีใบงานส่งของอยู่แล้ว (`delivery_tasks`) → ใช้สถานะจากใบงานนั้น ไม่สร้างซ้ำ

export type OrderSource = "shop" | "set14" | "bundle" | "prerelease" | "ma6" | "lorcana13" | "mat";
export type PayState = "paid" | "deposit" | "review" | "unpaid" | "refund" | "cancelled";
export type HandState = "not_needed" | "waiting_stock" | "to_hand" | "to_ship" | "picked_up" | "shipped";
export type Method = "pickup" | "ship" | "event";

export type CustomerOrder = {
  /** `${source}__${ref}` — doc id ของ sop_order_fulfillment */
  key: string;
  source: OrderSource;
  ref: string;
  createdAt: string | null;
  name: string;
  phone: string;
  items: string;
  total: number | null;
  /** ยอดที่ยังต้องเก็บก่อนส่งมอบ (มัดจำแล้ว เหลือส่วนที่เหลือ) */
  due: number | null;
  pay: PayState;
  payText: string;
  method: Method;
  address: string;
  hand: HandState;
  handText: string;
  /** ข้อความที่เคยจดไว้ในชีต/ระบบเดิม ให้คนดูประกอบ */
  note: string;
  /** ใบงานส่งของ (ร้านออนไลน์) ถ้ามี */
  deliveryTaskId?: string;
};

export const SOURCE_LABEL: Record<OrderSource, string> = {
  shop: "ร้านออนไลน์",
  set14: "พรีออเดอร์ Lorcana Set 14",
  bundle: "พรีออเดอร์ Bundle",
  prerelease: "Pre-release",
  ma6: "พรีออเดอร์ MA6",
  lorcana13: "พรีออเดอร์ Lorcana 13",
  mat: "พรีออเดอร์ Mega Tactic"
};

/** ข้อมูลต้นทางอยู่ไหน — ปุ่ม "ดูต้นทาง" บนแต่ละแถว */
export const SOURCE_ADMIN: Record<OrderSource, { label: string; url: string }> = {
  shop: { label: "หน้าจัดการร้านออนไลน์", url: "https://uplevelguild.com/admin-online-sales" },
  set14: { label: "หน้าแอดมิน Set 14", url: "https://uplevelguild.com/set14-admin" },
  bundle: { label: "สถิติ Bundle", url: "https://uplevelguild.com/bundle-stats" },
  prerelease: { label: "สถิติ Pre-release", url: "https://uplevelguild.com/prerelease-stats" },
  ma6: { label: "หน้าแอดมิน MA6", url: "https://uplevelguild.com/ma6-admin" },
  lorcana13: { label: "หน้าแอดมิน Lorcana 13", url: "https://uplevelguild.com/lorcana13-admin" },
  mat: { label: "ชีต Mega Tactic", url: "https://docs.google.com/spreadsheets/d/1GDIk7yo0B2RvK1PVlnR2HXXzT3OJVeBl8gNdhcjEUOA" }
};

export const PAY_LABEL: Record<PayState, string> = {
  paid: "จ่ายครบ",
  deposit: "มัดจำแล้ว",
  review: "รอตรวจสลิป",
  unpaid: "ยังไม่จ่าย",
  refund: "คืนเงิน",
  cancelled: "ยกเลิก"
};

export const HAND_LABEL: Record<HandState, string> = {
  not_needed: "ไม่ต้องส่งของ",
  waiting_stock: "รอของเข้าร้าน",
  to_hand: "รอลูกค้ามารับ",
  to_ship: "รอจัดส่ง",
  picked_up: "ลูกค้ารับแล้ว",
  shipped: "ส่งแล้ว"
};

/** สิ่งที่พนักงานกดบันทึก (sop_order_fulfillment/{key}) */
export type FulfillmentRecord = {
  state: "picked_up" | "shipped" | "partial";
  tracking?: string;
  note?: string;
  by: string;
  byName?: string;
  at: string;
};

export type Filter = "todo" | "review" | "unpaid" | "done" | "all";
export const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "todo", label: "ต้องส่งมอบ" },
  { value: "review", label: "รอตรวจสลิป" },
  { value: "unpaid", label: "ยังจ่ายไม่ครบ" },
  { value: "done", label: "เสร็จแล้ว" },
  { value: "all", label: "ทั้งหมด" }
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,฿\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
export const digits = (v: unknown): string => str(v).replace(/\D/g, "");

/** วันที่จากชีต ("5/21/2026 15:51:32" = เดือน/วัน/ปี ของ Google Form) หรือ ISO */
export function sheetDate(v: unknown): string | null {
  const s = str(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, mo, d, y, h = "0", mi = "0", se = "0"] = m;
    const pad = (x: string) => x.padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(se)}+07:00`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ---------- ร้านออนไลน์ (shop-orders + delivery_tasks) ----------
export type ShopRaw = {
  id: string;
  status?: string;
  customer?: { name?: string; phone?: string; address?: string; note?: string };
  items?: Array<{ name?: string; qty?: number }>;
  total?: number;
  createdAt?: string | null;
  shippedAt?: string | null;
};
export type DeliveryRaw = { id: string; orderId: string; status?: string; trackingNumber?: string; shippedAt?: string };

export function fromShop(o: ShopRaw, task?: DeliveryRaw): CustomerOrder | null {
  const status = str(o.status);
  const pay: PayState =
    status === "pending_review" ? "review" : status === "rejected" ? "cancelled" : status ? "paid" : "unpaid";
  if (pay === "cancelled") return null;
  const shipped = task?.status === "shipped" || Boolean(o.shippedAt);
  return {
    key: `shop__${o.id}`,
    source: "shop",
    ref: o.id.slice(0, 8).toUpperCase(),
    createdAt: o.createdAt || null,
    name: str(o.customer?.name) || "-",
    phone: digits(o.customer?.phone),
    items: (o.items || []).map((i) => `${str(i.name)} ×${i.qty ?? 1}`).join(", "),
    total: num(o.total),
    due: null,
    pay,
    payText: PAY_LABEL[pay],
    method: "ship",
    address: str(o.customer?.address),
    hand: pay === "paid" || pay === "review" ? (shipped ? "shipped" : "to_ship") : "to_ship",
    handText: shipped && task?.trackingNumber ? `ส่งแล้ว · ${task.trackingNumber}` : shipped ? "ส่งแล้ว" : HAND_LABEL.to_ship,
    note: str(o.customer?.note),
    deliveryTaskId: task?.id
  };
}

// ---------- พรีออเดอร์ในเว็บ (set14 / bundle / prerelease reservations) ----------
export type ReservationRaw = {
  id: string;
  status?: string;
  name?: string;
  nickname?: string;
  phone?: string;
  itemsLabel?: string;
  bundleName?: string;
  items?: Array<{ name?: string }>;
  total?: number;
  price?: number;
  fulfillment?: string;
  address?: string;
  createdAt?: string | null;
  expiresAt?: string | null;
};

export function fromReservation(source: "set14" | "bundle" | "prerelease", r: ReservationRaw, now = Date.now()): CustomerOrder | null {
  const status = str(r.status);
  if (status === "expired") return null;
  if (status === "held" && r.expiresAt && Date.parse(r.expiresAt) < now) return null;
  const pay: PayState = status === "paid" ? "paid" : status === "pending" || status === "approved" ? "review" : "unpaid";
  const method: Method = source === "prerelease" ? "event" : r.fulfillment === "ship" ? "ship" : "pickup";
  const items =
    str(r.itemsLabel) || str(r.bundleName) || (r.items || []).map((i) => str(i.name)).filter(Boolean).join(", ") ||
    (source === "prerelease" ? "ที่นั่ง Pre-release" : "");
  const hand: HandState = method === "event" ? "not_needed" : method === "ship" ? "to_ship" : "to_hand";
  return {
    key: `${source}__${r.id}`,
    source,
    ref: r.id.slice(0, 8).toUpperCase(),
    createdAt: r.createdAt || null,
    name: [str(r.nickname), str(r.name)].filter(Boolean).join(" · ") || "-",
    phone: digits(r.phone),
    items,
    total: num(r.total ?? r.price),
    due: null,
    pay,
    payText: status === "waiting" ? "รอคิว" : PAY_LABEL[pay],
    method,
    address: str(r.address),
    hand,
    handText: HAND_LABEL[hand],
    note: ""
  };
}

// ---------- MA6 (ชีต Form Responses 1) ----------
// A เวลา · B ชื่อ · C ชื่อเล่น · D เบอร์ · E จำนวนกล่อง · F การรับสินค้า · G ที่อยู่ · J สถานะ · K หมายเหตุแอดมิน
export const MA6_PRICE = 1980;
export const MA6_DEPOSIT = 1000;
export function fromMa6(row: string[], rowNumber: number): CustomerOrder | null {
  const name = str(row[1]);
  if (!name && !str(row[3])) return null;
  const boxes = num(row[4]) || 0;
  const status = str(row[9]);
  const receive = str(row[5]);
  const refund = status.includes("คืนมัดจำ");
  const pay: PayState = refund && boxes === 0
    ? "refund"
    : status.includes("ชำระครบ") ? "paid"
    : status.includes("มัดจำ") ? "deposit"
    : status.includes("รอตรวจ") ? "review"
    : status.includes("เกินโควต้า") ? "cancelled"
    : "unpaid";
  if (pay === "cancelled") return null;
  const method: Method = receive.includes("จัดส่ง") ? "ship" : "pickup";
  const pickedUp = /รับแล้ว/.test(receive);
  const hand: HandState = pay === "refund" ? "not_needed" : pickedUp ? "picked_up" : method === "ship" ? "to_ship" : "to_hand";
  return {
    key: `ma6__row${rowNumber}`,
    source: "ma6",
    ref: `แถว ${rowNumber}`,
    createdAt: sheetDate(row[0]),
    name: [str(row[2]), name].filter(Boolean).join(" · "),
    phone: digits(row[3]),
    items: `MA6 Booster Box ×${boxes}`,
    total: boxes * MA6_PRICE,
    due: pay === "deposit" ? boxes * (MA6_PRICE - MA6_DEPOSIT) : null,
    pay,
    payText: status || PAY_LABEL[pay],
    method,
    address: method === "ship" ? str(row[6]) : "",
    hand,
    handText: pickedUp ? `ในชีตจดว่า "${receive}"` : HAND_LABEL[hand],
    note: str(row[10])
  };
}

// ---------- Lorcana 13 (ชีต Responses) ----------
// A เวลา · B ชื่อ · C เบอร์ · D วิธีรับ · E ที่อยู่ · F–L จำนวนสินค้า (หัวตาราง = ชื่อสินค้า) · O ยอดรวม
// Q คงเหลือ · U สถานะ · W บันทึกการรับของ · Z ยอด Phase2 ต้องโอน · AC สถานะ Phase 2
export function fromLorcana13(row: string[], header: string[], rowNumber: number): CustomerOrder | null {
  const name = str(row[1]);
  if (!name && !str(row[2])) return null;
  const items = header
    .slice(5, 12)
    .map((h, i) => ({ name: str(h).replace(/\s*\n\s*/g, " ").replace(/\s+—\s+/g, " — "), qty: num(row[5 + i]) || 0 }))
    .filter((i) => i.qty > 0)
    .map((i) => `${i.name} ×${i.qty}`)
    .join(", ");
  const status = str(row[20]);
  const phase2 = str(row[28]);
  const dueRaw = num(row[25]);
  const cleared = /เคลียร์|ชำระครบ|ครบแล้ว/.test(phase2) || /ชำระครบ/.test(status);
  const pay: PayState = /ยกเลิก/.test(status)
    ? "cancelled"
    : cleared ? "paid"
    : /รอตรวจ/.test(status) || /รอตรวจ/.test(phase2) ? "review"
    : /มัดจำ/.test(status) ? "deposit"
    : "unpaid";
  if (pay === "cancelled") return null;
  const method: Method = str(row[3]).includes("ส่ง") ? "ship" : "pickup";
  const pickupNote = str(row[22]);
  const pickedUp = /แล้ว/.test(pickupNote);
  const hand: HandState = pickedUp ? "picked_up" : method === "ship" ? "to_ship" : "to_hand";
  return {
    key: `lorcana13__row${rowNumber}`,
    source: "lorcana13",
    ref: `แถว ${rowNumber}`,
    createdAt: sheetDate(row[0]),
    name,
    phone: digits(row[2]),
    items,
    total: num(row[14]),
    due: pay === "deposit" ? (dueRaw ?? num(row[16])) : null,
    pay,
    payText: [status, phase2].filter(Boolean).join(" → ") || PAY_LABEL[pay],
    method,
    address: method === "ship" ? str(row[4]) : "",
    hand,
    handText: pickupNote ? `ในชีตจดว่า "${pickupNote}"` : HAND_LABEL[hand],
    note: ""
  };
}

// ---------- Mega Tactic (ชีต Orders) ----------
// A เวลา · B OrderID · C ชื่อ · D เบอร์ · E วิธีรับ · F ที่อยู่ · G รายการ · H จำนวน · J ยอดรวม · L ของถึงร้าน · M สถานะ · N รับของ
export function fromMat(row: string[], today: string): CustomerOrder | null {
  const ref = str(row[1]);
  if (!ref) return null;
  const status = str(row[12]);
  const pay: PayState = /ผ่าน|ชำระ/.test(status) ? "paid" : /ไม่ผ่าน|ยกเลิก/.test(status) ? "cancelled" : status ? "review" : "unpaid";
  if (pay === "cancelled") return null;
  const method: Method = str(row[4]).includes("ส่ง") ? "ship" : "pickup";
  const received = str(row[13]).toUpperCase() === "TRUE";
  const arrival = thaiDateIso(str(row[11]));
  const hand: HandState = received
    ? method === "ship" ? "shipped" : "picked_up"
    : arrival && arrival > today ? "waiting_stock"
    : method === "ship" ? "to_ship" : "to_hand";
  return {
    key: `mat__${ref}`,
    source: "mat",
    ref,
    createdAt: sheetDate(row[0]),
    name: str(row[2]) || "-",
    phone: digits(row[3]),
    items: /×\s*\d/.test(str(row[6])) ? str(row[6]) : `${str(row[6]).replace(/\s*×\s*$/, "")} ×${str(row[7]) || 1}`,
    total: num(row[9]),
    due: null,
    pay,
    payText: status || PAY_LABEL[pay],
    method,
    address: method === "ship" ? str(row[5]) : "",
    hand,
    handText: hand === "waiting_stock" ? `ของถึงร้าน ${row[11]}` : HAND_LABEL[hand],
    note: ""
  };
}

const TH_MONTH: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12
};
/** "17 ก.ค. 2026" → "2026-07-17" (ปี พ.ศ. ก็รับ) */
export function thaiDateIso(s: string): string | null {
  const m = s.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if (!m || !TH_MONTH[m[2]]) return null;
  let y = Number(m[3]);
  if (y > 2400) y -= 543;
  return `${y}-${String(TH_MONTH[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// ---------- สถานะล็อต (เจ้าของร้านกดใน sop_order_sources/{source}) ----------
// waiting = ของยังไม่ถึงร้าน (ไม่โผล่ในงานน้อง) · open = ถึงแล้ว ต้องส่งมอบ · closed = ส่งมอบครบทั้งล็อตแล้ว
// (ใช้ปิดล็อตเก่าที่ส่งของไปหมดแล้วแต่ไม่เคยมีใครจดไว้ทีละคน)
export type LotState = "waiting" | "open" | "closed";
export const LOT_LABEL: Record<LotState, string> = { waiting: "ยังไม่ถึงร้าน", open: "ถึงแล้ว ต้องส่งมอบ", closed: "ส่งมอบครบแล้ว" };
/** ค่าเริ่มต้นเมื่อเจ้าของร้านยังไม่เคยกด: พรีออเดอร์ล็อตใหม่ถือว่ายังไม่ถึง */
export const DEFAULT_LOT: Record<OrderSource, LotState> = {
  shop: "open", set14: "waiting", bundle: "waiting", prerelease: "open", ma6: "open", lorcana13: "open", mat: "open"
};
export function applyLot(order: CustomerOrder, lot: LotState): CustomerOrder {
  if (lot === "open" || (order.hand !== "to_hand" && order.hand !== "to_ship")) return order;
  if (lot === "waiting") return { ...order, hand: "waiting_stock", handText: "ของล็อตนี้ยังไม่ถึงร้าน" };
  const hand: HandState = order.hand === "to_ship" ? "shipped" : "picked_up";
  return { ...order, hand, handText: `${HAND_LABEL[hand]} (เจ้าของร้านปิดล็อตแล้ว)` };
}

// ---------- ที่พนักงานกดบันทึก ชนะที่เดาจากต้นทาง ----------
export function applyFulfillment(order: CustomerOrder, rec?: FulfillmentRecord): CustomerOrder & { record?: FulfillmentRecord } {
  if (!rec) return order;
  if (rec.state === "partial") {
    return { ...order, record: rec, handText: `รับไปบางส่วน${rec.note ? ` · ${rec.note}` : ""}` };
  }
  const hand: HandState = rec.state;
  const who = rec.byName || rec.by;
  return {
    ...order,
    record: rec,
    hand,
    handText: `${HAND_LABEL[hand]}${rec.tracking ? ` · ${rec.tracking}` : ""}${who ? ` · ${who}` : ""}`
  };
}

const OPEN_HAND: HandState[] = ["to_hand", "to_ship"];
export function isTodo(o: CustomerOrder): boolean {
  return OPEN_HAND.includes(o.hand) && (o.pay === "paid" || o.pay === "deposit");
}
export function isDone(o: CustomerOrder): boolean {
  return o.hand === "picked_up" || o.hand === "shipped" || (o.hand === "not_needed" && (o.pay === "paid" || o.pay === "refund"));
}

export function matchesFilter(o: CustomerOrder, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "todo") return isTodo(o);
  if (f === "review") return o.pay === "review";
  if (f === "unpaid") return o.pay === "unpaid" || (o.pay === "deposit" && !isDone(o));
  return isDone(o);
}

/** ค้นด้วยชื่อ / เบอร์ (กี่ตัวท้ายก็ได้) / เลขออเดอร์ / ชื่อสินค้า */
export function matchesQuery(o: CustomerOrder, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const d = query.replace(/[\s-]/g, "");
  if (/^\d{3,}$/.test(d)) return o.phone.endsWith(d) || o.phone.includes(d);
  return [o.name, o.ref, o.items, SOURCE_LABEL[o.source]].some((v) => v.toLowerCase().includes(query));
}

export function orderCounts(orders: CustomerOrder[]): Record<Filter, number> {
  return {
    todo: orders.filter(isTodo).length,
    review: orders.filter((o) => o.pay === "review").length,
    unpaid: orders.filter((o) => matchesFilter(o, "unpaid")).length,
    done: orders.filter(isDone).length,
    all: orders.length
  };
}

/** เรียง: ต้องทำก่อน แล้วใหม่ไปเก่า */
export function sortOrders(orders: CustomerOrder[]): CustomerOrder[] {
  return [...orders].sort((a, b) => {
    const t = Number(isTodo(b)) - Number(isTodo(a));
    if (t) return t;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}
