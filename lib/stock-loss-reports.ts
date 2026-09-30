// รายงาน "ของหาย" น้ำ/ขนม สาขาบางแค — เจ้าของดูอย่างเดียว
//
// ตัวเลขคำนวณนอกระบบ (Stock Take CSV จาก BackOffice + ยอดขาย StoreHub API) แล้วบันทึกลงที่นี่
// เพราะ StoreHub ไม่มี API ของ stocktake. สูตร: หาย = นับต้นรอบ + รับเข้า − นับปลายรอบ − ขายจริง
// เฉพาะ Snack/Drink ไม่นับมาม่า · มูลค่า = ราคาขายจริงต่อชิ้น (รวม VAT แล้ว) · ป้าย = ราคาเต็มไม่หักโปร

export type StockLossItem = {
  name: string;
  qty: number;
  /** ราคาขายจริงเฉลี่ยต่อชิ้นในช่วงนั้น รวม VAT */
  unitPrice: number;
  /** ราคาป้ายต่อชิ้น รวม VAT */
  labelPrice: number;
  note?: string;
};

export type StockLossReport = {
  id: string;
  label: string;
  period: string;
  days: number;
  items: StockLossItem[];
  /** สินค้าที่นับตรงกับยอดขาย */
  exactCount: number;
  findings: { title: string; detail: string }[];
  countErrors: number;
};

export const STOCK_LOSS_REPORTS: StockLossReport[] = [
  {
    id: "2026-09a",
    label: "31 ส.ค. – 16 ก.ย.",
    period: "31 ส.ค. – 16 ก.ย. 2026",
    days: 17,
    exactCount: 10,
    countErrors: 4,
    items: [
      { name: "Coke", qty: 9, unitPrice: 16.95, labelPrice: 20 },
      { name: "Coke Zero", qty: 6, unitPrice: 18.61, labelPrice: 20 },
      { name: "เลย์ โนริสาหร่าย", qty: 3, unitPrice: 20.74, labelPrice: 25 },
      { name: "เลย์ หมึกย่างฮอตชิลลี่", qty: 1, unitPrice: 22.89, labelPrice: 25 },
      { name: "คอนเน่ รสธรรมดา", qty: 1, unitPrice: 25, labelPrice: 25, note: "ไม่มียอดขายในรอบ ใช้ราคาคอนเน่ชีส" },
      { name: "โคอาล่ามาช", qty: 1, unitPrice: 18.26, labelPrice: 20 },
      { name: "ทวิสโก้เล็ก", qty: 1, unitPrice: 10, labelPrice: 10 }
    ],
    findings: [
      {
        title: "Coke + Coke Zero = 66% ของที่หาย",
        detail: "15 กระป๋อง หายเรื่อยๆ ทั้งรอบ ไม่ใช่ครั้งเดียว"
      },
      {
        title: "นับแล้วไม่เข้าระบบ 6–12 ก.ย.",
        detail: "หลายรอบค่าที่ระบบคาดไว้ค้างเลขเดิม เลยไล่ไม่ได้ว่าหายกะไหน"
      }
    ]
  },
  {
    id: "2026-08",
    label: "ส.ค. ทั้งเดือน",
    period: "1 ส.ค. – 1 ก.ย. 2026",
    days: 31,
    exactCount: 13,
    countErrors: 16,
    items: [
      { name: "Oishi น้ำผึ้งมะนาว", qty: 6, unitPrice: 23.96, labelPrice: 25, note: "หายคืนเดียว 29 ส.ค. (17 → 11 ไม่มียอดขาย)" },
      { name: "น้ำเปล่า", qty: 7, unitPrice: 9.95, labelPrice: 10, note: "นับเฉพาะ 13–31 ส.ค." },
      { name: "Coke", qty: 4, unitPrice: 17.19, labelPrice: 20 },
      { name: "ทีพลัส ชาอูหลงน้ำผึ้ง", qty: 2, unitPrice: 21.52, labelPrice: 25 },
      { name: "เลย์ โนริสาหร่าย", qty: 2, unitPrice: 20.86, labelPrice: 25 },
      { name: "ทิวลี่", qty: 4, unitPrice: 9.67, labelPrice: 10 },
      { name: "เลย์ หมึกย่างฮอตชิลลี่", qty: 1, unitPrice: 22.92, labelPrice: 25 },
      { name: "Coke Zero", qty: 1, unitPrice: 17.91, labelPrice: 20 }
    ],
    findings: [
      {
        title: "Oishi 6 ขวด หายในคืนเดียว",
        detail: "29 ส.ค. กะเช้านับได้ 17 · กะดึกกรอก 0 · เช้า 30 ส.ค. นับได้ 11 — ช่วงนั้นไม่มียอดขาย ถ้าจะตาม ดูกะคืนวันที่ 29"
      },
      {
        title: "น้ำเปล่า 1–12 ส.ค. ตรวจไม่ได้",
        detail: "นับกระโดด ±12 ขวดหลายรอบโดยไม่มีรับเข้าในระบบ (นับแพ็คหลังร้านบ้างไม่นับบ้าง) · คืน 11→12 ส.ค. นับได้ 19 → เช้าเหลือ 5 ถ้าหายจริง = 14 ขวด ≈ 139฿ ยังไม่รวมในยอด"
      }
    ]
  }
];

export function reportTotals(report: StockLossReport) {
  const qty = report.items.reduce((sum, item) => sum + item.qty, 0);
  const value = report.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const label = report.items.reduce((sum, item) => sum + item.qty * item.labelPrice, 0);
  return { qty, value, label, perDay: value / report.days };
}
