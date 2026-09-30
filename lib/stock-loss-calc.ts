// ของหาย น้ำ/ขนม — คำนวณจากผลนับ Stock Take + ยอดขายจริงในช่วงที่เลือก (pure, ไม่มี I/O)
//
// หาย = นับต้นช่วง + รับเข้า − นับปลายช่วง − ขายจริง  (ต่อ SKU)
//
// ข้อมูลนับจริงมีเสียงรบกวนเยอะ กติกาที่ใช้ (ได้มาจากการไล่ข้อมูล ส.ค.–ก.ย. 2026 ด้วยมือ):
//  1. เลขนับที่ "กรอกผิด" — ถ้าตัดรอบนั้นทิ้งแล้วรอบก่อน/หลังต่อกันลงตัว → ไม่ใช้รอบนั้น
//     (เช่น Coke 67 → 39 → 63: 39 คือพิมพ์ผิด ไม่ใช่ของหาย 28 กระป๋อง)
//  2. รับเข้า = ระบบคาดไว้กระโดดขึ้น และนับได้ตรงกับที่ระบบคาด (กดรับเข้าในระบบแล้ว)
//  3. นับได้เพิ่มขึ้น ≥ 3 ชิ้นโดยไม่มีรับเข้าในระบบ → เอาไปหักกับ "หาย" ใน 3 วันก่อนหน้าก่อน (นับขาดแล้ว
//     รอบหลังนับเจอ = ไม่ได้หาย) ที่เหลือถือว่าของเข้า (ลืมกดรับ/หยิบจากหลังร้าน) ไม่ใช่ติดลบ
//  4. ห้ามใช้ผลรวม Difference ตรงๆ — รอบนับที่เปิดซ้อนกันทำให้ระบบ apply ซ้ำ
// ไม่นับมาม่า · มูลค่า = ราคาขายจริงเฉลี่ยต่อชิ้นในช่วงนั้น (รวม VAT แล้ว ห้ามคูณ 1.07 ซ้ำ)

export type StockCount = {
  sku: string;
  name: string;
  /** เวลาเริ่มนับ (ms) */
  at: number;
  expected: number;
  counted: number;
};

export type SaleLine = { sku: string; at: number; qty: number; total: number };

export type StockLossRow = {
  sku: string;
  name: string;
  start: number;
  end: number;
  received: number;
  sold: number;
  lost: number;
  unitPrice: number;
  labelPrice: number;
  value: number;
  /** ของเข้าโดยไม่มีรับเข้าในระบบ (ชิ้น) — เยอะ = ตัวเลขนับไม่นิ่ง */
  unrecorded: number;
  typos: number;
  /** เหตุการณ์หายที่ใหญ่ที่สุด (เวลาเริ่มนับรอบที่พบ) */
  biggest?: { at: number; qty: number };
};

export type StockLossResult = {
  rows: StockLossRow[];
  lostRows: StockLossRow[];
  totalQty: number;
  totalValue: number;
  totalLabel: number;
  countRounds: number;
  typos: number;
  firstCount?: number;
  lastCount?: number;
};

const UNRECORDED_MIN = 3;
/** นับขาดแล้วนับเจอภายในกี่ ms ถึงถือว่าเป็นการนับพลาด ไม่ใช่ของหาย */
const RECOUNT_WINDOW = 3 * 24 * 60 * 60 * 1000;

export function isSnackOrDrink(sku: string, name: string): boolean {
  return /^(drink|snack|snak)/i.test(sku.trim()) && !name.includes("มาม่า");
}

export function computeStockLoss(
  counts: StockCount[],
  sales: SaleLine[],
  labelPrices: Record<string, number>,
  from: number,
  to: number
): StockLossResult {
  const bySku = new Map<string, StockCount[]>();
  for (const count of counts) {
    // ไม่ตัดช่วงตรงนี้ — ต้องใช้รอบนับนอกช่วงช่วยจับเลขกรอกผิดที่ขอบช่วง
    if (!isSnackOrDrink(count.sku, count.name)) continue;
    const list = bySku.get(count.sku) || [];
    list.push(count);
    bySku.set(count.sku, list);
  }
  const salesBySku = new Map<string, SaleLine[]>();
  for (const sale of sales) {
    const list = salesBySku.get(sale.sku) || [];
    list.push(sale);
    salesBySku.set(sale.sku, list);
  }

  const rounds = new Set<number>();
  const rows: StockLossRow[] = [];
  let typoTotal = 0;

  for (const [sku, raw] of bySku) {
    const skuSales = salesBySku.get(sku) || [];
    const soldBetween = (a: number, b: number) =>
      skuSales.reduce((sum, s) => (s.at >= a && s.at < b ? sum + s.qty : sum), 0);
    const all = [...raw].sort((a, b) => a.at - b.at);

    let typos = 0;
    for (let i = 1; i < all.length - 1; ) {
      const a = all[i - 1];
      const b = all[i];
      const c = all[i + 1];
      const dv = a.counted - soldBetween(a.at, b.at) - b.counted;
      const gap = a.counted - soldBetween(a.at, c.at) - c.counted;
      const bIsReceipt = Math.abs(b.counted - b.expected) <= 2 && b.expected - a.counted + soldBetween(a.at, b.at) >= 3;
      if (Math.abs(dv) >= 4 && Math.abs(gap) <= Math.max(2, Math.abs(dv) / 2.5) && !bIsReceipt) {
        all.splice(i, 1);
        if (b.at >= from && b.at <= to) typos += 1;
        continue;
      }
      i += 1;
    }
    const pts = all.filter((p) => p.at >= from && p.at <= to);
    pts.forEach((p) => rounds.add(p.at));
    if (pts.length < 2) continue;

    let received = 0;
    let unrecorded = 0;
    let lost = 0;
    const losses: { at: number; qty: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const s = soldBetween(a.at, b.at);
      const recv = b.expected - a.counted + s;
      let d: number;
      if (recv >= 3 && Math.abs(b.counted - b.expected) <= 2) {
        received += recv;
        d = a.counted + recv - s - b.counted;
      } else {
        d = a.counted - s - b.counted;
      }
      if (d <= -UNRECORDED_MIN) {
        let gain = -d;
        for (let k = losses.length - 1; k >= 0 && gain > 0; k--) {
          if (b.at - losses[k].at > RECOUNT_WINDOW) break;
          const take = Math.min(gain, losses[k].qty);
          losses[k].qty -= take;
          gain -= take;
        }
        received += gain;
        unrecorded += gain;
        continue;
      }
      if (d > 0) losses.push({ at: b.at, qty: d });
      else lost += d; // นับเกินเล็กน้อย (ขายก่อน/หลังนับคร่อมเวลา) หักกลบ
    }
    lost = Math.max(0, lost + losses.reduce((sum, l) => sum + l.qty, 0));
    const biggest = losses.reduce<StockLossRow["biggest"]>((top, l) => (l.qty > 0 && (!top || l.qty > top.qty) ? { at: l.at, qty: l.qty } : top), undefined);

    const first = pts[0];
    const last = pts[pts.length - 1];
    const inRange = skuSales.filter((s) => s.at >= first.at && s.at < last.at);
    const sold = inRange.reduce((sum, s) => sum + s.qty, 0);
    const priced = skuSales.filter((s) => s.at >= from && s.at <= to && s.qty > 0);
    const pricedQty = priced.reduce((sum, s) => sum + s.qty, 0);
    const pricedTotal = priced.reduce((sum, s) => sum + s.total, 0);
    const labelPrice = labelPrices[sku] || 0;
    const unitPrice = pricedQty ? pricedTotal / pricedQty : labelPrice;

    typoTotal += typos;
    rows.push({
      sku,
      name: first.name,
      start: first.counted,
      end: last.counted,
      received,
      sold,
      lost,
      unitPrice,
      labelPrice,
      value: lost * unitPrice,
      unrecorded,
      typos,
      biggest: lost > 0 ? biggest : undefined
    });
  }

  const lostRows = rows.filter((r) => r.lost > 0).sort((a, b) => b.value - a.value);
  const sortedRounds = [...rounds].sort((a, b) => a - b);
  return {
    rows,
    lostRows,
    totalQty: lostRows.reduce((sum, r) => sum + r.lost, 0),
    totalValue: lostRows.reduce((sum, r) => sum + r.value, 0),
    totalLabel: lostRows.reduce((sum, r) => sum + r.lost * r.labelPrice, 0),
    countRounds: sortedRounds.length,
    typos: typoTotal,
    firstCount: sortedRounds[0],
    lastCount: sortedRounds[sortedRounds.length - 1]
  };
}
