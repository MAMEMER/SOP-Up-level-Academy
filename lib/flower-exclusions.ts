// ยอดที่ไม่นับเข้าฐานเป้าดอกไม้ — แชมป์เคาะ 10 พ.ย. 2569
//
// ค่าสมัครกิจกรรม (แข่ง/พรีรีลีส/อีเวนต์) กับพรีออเดอร์ ไม่ใช่ยอดที่ลูกค้าให้ดอกไม้กับน้องหน้าร้าน
// ถ้านับเข้าฐาน เดือนที่มีพรีออเดอร์ก้อนใหญ่เป้าจะพุ่งจนไม่มีใครถึง — หักออกให้แฟร์
// ค่าบริการบอร์ดเกม (หมวด Event ใน StoreHub เหมือนกัน) ยังนับ เพราะน้องดูแลโต๊ะจริง

export type ExcludedKind = "event" | "preorder";

export type ShProduct = { id?: string; name?: string; category?: string; tags?: string[] | null };
export type ShItem = { productId?: string; total?: number };

const BOARD_GAME = /บอร์ดเกม/;

export function excludedKind(product: ShProduct | undefined): ExcludedKind | null {
  if (!product) return null;
  const category = String(product.category || "").trim().toLowerCase();
  const name = String(product.name || "").toLowerCase();
  if (category === "pre order" || /pre ?o(rd|dr)er|พรีออเดอร์/.test(name)) return "preorder";
  if (/pre[- ]?release/.test(name)) return "event";
  if (category === "event") return BOARD_GAME.test(name) ? null : "event";
  return null;
}

export function kindByProductId(products: ShProduct[]): Map<string, ExcludedKind> {
  const map = new Map<string, ExcludedKind>();
  for (const product of products) {
    const kind = excludedKind(product);
    if (product.id && kind) map.set(product.id, kind);
  }
  return map;
}

export type BillExclusion = { excludedEvent: number; excludedPreorder: number };

/** บาทของรายการกิจกรรม/พรีออเดอร์ในบิล — ปัด 2 ตำแหน่ง */
export function billExclusion(items: ShItem[] | undefined, kinds: Map<string, ExcludedKind>): BillExclusion {
  let event = 0;
  let preorder = 0;
  for (const item of items || []) {
    const kind = item.productId ? kinds.get(item.productId) : undefined;
    const baht = Math.max(0, Number(item.total) || 0);
    if (kind === "event") event += baht;
    else if (kind === "preorder") preorder += baht;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { excludedEvent: round(event), excludedPreorder: round(preorder) };
}

/** ยอดของบิลที่นับเข้าฐานเป้า — บิลที่ยังไม่ถูกแท็กนับเต็ม */
export function countedTotal(bill: { total?: number; excludedEvent?: number; excludedPreorder?: number }): number {
  const total = Math.max(0, Number(bill.total) || 0);
  const excluded = Math.max(0, Number(bill.excludedEvent) || 0) + Math.max(0, Number(bill.excludedPreorder) || 0);
  return Math.max(0, total - excluded);
}
