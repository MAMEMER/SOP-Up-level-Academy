import { createHash } from "node:crypto";

export type Source = "shop-orders" | "shop_orders" | "set14-orders" | "bundle-orders" | "ma6-sheet" | "lorcana13-sheet";
export type HandoverLine = {
  key: string; sourceKey: string; lineKey: string; source: Source; orderId: string;
  phone: string; customerName: string; productId: string; productName: string; unit: string;
  entitlement: number; fingerprint: string; paid: boolean; shipped: boolean; blockers: string[];
};
export type Balance = { entitlement: number; delivered: number; cancelled: number; inTransit: number; approved: boolean; fingerprint: string };
export type EventType = "opening_balance" | "handover" | "return" | "cancel_entitlement" | "reversal";
export type EventLine = { key: string; quantity: number; referenceEventId?: string };
export type LedgerEvent = { eventId: string; type: EventType; phone: string; lines: EventLine[]; returnDisposition?: "replace" | "close" };
export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function normalizePhone(value: unknown): string {
  let phone = String(value ?? "").replace(/[\s\-()']/g, "");
  if (phone.startsWith("+66")) phone = "0" + phone.slice(3);
  else if (phone.startsWith("66") && phone.length === 11) phone = "0" + phone.slice(2);
  return /^0[689]\d{8}$/.test(phone) ? phone : "";
}
export function maskPhone(phone: string): string { return phone ? phone.slice(0, 3) + "••••" + phone.slice(-3) : "ไม่มีเบอร์"; }
export function remaining(b: Balance): number { return b.entitlement - b.cancelled - b.delivered - b.inTransit; }
export function integer(value: unknown): number {
  const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0 || n > 100000) throw new Error("จำนวนต้องเป็นจำนวนเต็มบวก"); return n;
}
export function canDeliver(line: HandoverLine, b?: Balance): boolean {
  return !!b && b.approved && b.fingerprint === line.fingerprint && line.paid && !line.shipped && !line.blockers.length && remaining(b) > 0;
}
export function applyMovement(b: Balance, type: Exclude<EventType, "opening_balance">, quantity: number, disposition = "replace", reverseType?: EventType): Balance {
  integer(quantity);
  const next = { ...b };
  if (!b.approved) throw new Error("ยังไม่ยืนยันยอดตั้งต้น");
  if (type === "handover") next.delivered += quantity;
  if (type === "cancel_entitlement") next.cancelled += quantity;
  if (type === "return") { next.delivered -= quantity; if (disposition === "close") next.cancelled += quantity; }
  if (type === "reversal") {
    if (reverseType === "handover") next.delivered -= quantity;
    else if (reverseType === "cancel_entitlement") next.cancelled -= quantity;
    else throw new Error("กลับได้เฉพาะส่งมอบหรือยกเลิก ให้ใช้เหตุการณ์ชดเชยสำหรับรายการอื่น");
  }
  if ([next.delivered, next.cancelled, next.inTransit, remaining(next)].some(n => n < 0 || !Number.isSafeInteger(n))) throw new Error("จำนวนเกินยอดที่มีสิทธิ์");
  return next;
}

type Raw = Record<string, any>;
/** Only order collections produce entitlements. Payments/reservations/delivery jobs never do. */
export function adaptOrder(source: Source, id: string, raw: Raw, bom: Record<string, { id: string; name: string; unit: string; quantity: number }[]> = {}): HandoverLine[] {
  const phone = normalizePhone(raw.customer?.phone ?? raw.userPhone ?? raw.phone);
  const name = String(raw.customer?.name ?? raw.name ?? "ลูกค้า");
  const sourceKey = `${source}/${id}`;
  const paid = source === "shop-orders" ? raw.status === "confirmed" && raw.slipStatus === "paid" : source === "shop_orders" ? raw.status === "fulfilled" : raw.status === "paid";
  const shipped = Boolean(raw.shippedAt || raw.trackingNumber || raw.fulfillment === "ship");
  let items: Raw[] = Array.isArray(raw.items) ? raw.items : [];
  if (!items.length && source === "shop-orders") items = [{ sku: raw.product, name: raw.product, qty: raw.qty, pieces: raw.totalPieces }];
  if (source === "shop_orders") {
    if (raw.effectType !== "physical" && raw.itemCategory !== "physical") return [];
    items = [{ sku: raw.itemId, name: raw.itemName, qty: 1 }];
  }
  if (!items.length && source === "bundle-orders") items = [{ bundleId: raw.bundleId, bundleName: raw.bundleName }];
  const fingerprint = hash({ source, id, phone, items, status: raw.status ?? "", slipStatus: raw.slipStatus ?? "", shipped, fulfillment: raw.fulfillment ?? "", bom });
  return items.flatMap((item, index) => {
    const productId = String(item.sku ?? item.productId ?? item.bundleId ?? "unknown");
    const components = source === "bundle-orders" ? bom[productId] : undefined;
    const mapped = components ?? [{ id: productId, name: String(item.name ?? item.bundleName ?? item.itemName ?? productId), unit: source === "bundle-orders" ? "ชุด (รอแยกส่วนประกอบ)" : "ชิ้น", quantity: source === "shop-orders" ? Number(item.pieces ?? item.qty) : Number(item.qty ?? 1) }];
    return mapped.map((component) => {
      const lineKey = `${index}:${productId}:${component.id}`;
      const blockers: string[] = [];
      if (!phone) blockers.push("ไม่มีเบอร์ที่ยืนยันได้");
      if (!paid) blockers.push("ยังไม่ยืนยันชำระครบ");
      if (source === "bundle-orders" && !components) blockers.push("ยังไม่รับรองส่วนประกอบ Bundle");
      if (!Number.isSafeInteger(component.quantity) || component.quantity <= 0) blockers.push("จำนวนหรือหน่วยไม่ชัดเจน");
      return { key: hash(`${sourceKey}/${lineKey}`), sourceKey, lineKey, source, orderId: id, phone, customerName: name, productId: component.id, productName: component.name, unit: component.unit, entitlement: Number.isSafeInteger(component.quantity) && component.quantity > 0 ? component.quantity : 0, fingerprint, paid, shipped, blockers };
    });
  });
}

export const SHEETS = [
  { source: "ma6-sheet" as Source, id: "1QeoXLtY1NgFkuCX_x3PFwRf9JqfI7jpP2lJv6dx1XEc", tab: "Form Responses 1", phoneColumn: 3 },
  { source: "lorcana13-sheet" as Source, id: "1IpEqQgX6IuMoENzD1lfR8BsfBwgecGYHUD5WDqSlyiM", tab: "Responses", phoneColumn: 2 }
];
export function adaptSheet(source: Source, sheetId: string, tab: string, rows: string[][]): HandoverLine[] {
  const names = ["Booster Box", "Playmat Mike", "Playmat Circle of Life", "Collection Starter Rapunzel", "Beast Gift Box (ยกเลิก)", "Illumineer's Quest", "Portfolio Mickey"];
  const ids = ["booster_box", "playmat_mike", "playmat_circle", "starter_rapunzel", "beast_giftbox", "quest_hunny", "portfolio_mickey"];
  const counts = new Map<string, number>();
  const lines = rows.slice(1).flatMap((row, i) => {
    const phone = normalizePhone(row[source === "ma6-sheet" ? 3 : 2]);
    if (!row[0] || !phone) return [];
    // Row number is a locator only. Changed content changes the key and remains blocked.
    const identity = hash([sheetId, tab, row[0], phone]);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
    const sourceKey = `${source}/${identity}`;
    const fingerprint = hash(row);
    const quantities = source === "ma6-sheet" ? [Number(row[4])] : row.slice(5, 12).map(Number);
    return quantities.flatMap((quantity, index) => {
      if (!Number.isSafeInteger(quantity) || quantity <= 0) return [];
      const productId = source === "ma6-sheet" ? "ma6_box" : ids[index];
      const paid = source === "ma6-sheet" && String(row[9]).includes("ชำระครบ");
      const blockers = source === "lorcana13-sheet" ? ["ต้องรับรอง allocation และการชำระรายสินค้า"] : [];
      if (productId === "beast_giftbox") blockers.push("สินค้าถูกยกเลิก ห้ามสร้างสิทธิ์รับ");
      return [{ key: hash(`${sourceKey}/${productId}`), sourceKey, lineKey: productId, source, orderId: `${tab} แถว ${i + 2}`, phone, customerName: row[1] || "ลูกค้า", productId, productName: source === "ma6-sheet" ? "MA6 Booster Box" : names[index], unit: source === "ma6-sheet" || index === 0 ? "บ็อกซ์" : "ชิ้น", entitlement: quantity, fingerprint, paid, shipped: false, blockers }];
    });
  });
  return lines.map(line => counts.get(line.sourceKey.split("/")[1])! > 1 ? { ...line, blockers: [...line.blockers, "identity ของแถวชนกัน ต้องตรวจสอบ"] } : line);
}
