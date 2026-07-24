export type MonthlyStockSinglePhase = {
  id: string;
  title: string;
  timeLabel: string;
  category: "stock";
  icon: string;
  goal: string;
  caution: string;
  scheduleLabel: string;
  checklist: string[];
};

// ลิงก์ระบบ StoreHub Stock Take (นับ Single card แยกตามเกม/พื้นที่)
export const storehubStocktakesUrl = "https://uplevel.storehubhq.com/stocks/stocktakes";

// สถานะ Stock Take ที่อนุญาตให้ส่งงานได้ (ต้อง In Progress หรือ Completed ก่อนส่งงาน)
export const submittableStocktakeStatuses = ["In Progress", "Completed"] as const;
export const stocktakeStatusOptions = ["In Progress", "Completed", "Cancelled"] as const;

// เกมการ์ดที่ต้องนับแยกกัน (เลือกทีละเกม ห้ามนับปน)
export const singleCardGameOptions = ["Pokémon", "Lorcana", "Rift Bound", "อื่น ๆ"] as const;

// พื้นที่จัดเก็บที่ต้องนับแยกกัน (นับทีละพื้นที่)
export const singleCardStorageAreaOptions = [
  "Binder",
  "ตู้โชว์",
  "กล่อง Stock",
  "การ์ดจอง",
  "การ์ดรอตรวจราคา"
] as const;

// สถานะสรุปยอด +/- (ไม่มี = ตรงทุกรายการ, มี = มีรายการต่างต้องให้หัวหน้าตรวจ)
export const discrepancyStatusOptions = ["ไม่มี", "มี"] as const;

export const monthlyStockSinglePhase: MonthlyStockSinglePhase = {
  id: "stock-single-card-work",
  title: "Stock Single card",
  timeLabel: "งานประจำเดือน · ไม่เกิน 3 วัน (11:00-23:59)",
  category: "stock",
  icon: "SC",
  goal: "นับ Single card ประจำเดือนแยกตามเกมและพื้นที่จัดเก็บ ให้พนักงานนับจริงเทียบระบบ StoreHub แล้วสรุปยอด +/- โดยห้ามปรับยอดในระบบก่อนหัวหน้าอนุมัติ",
  caution: "ส่งงานได้เฉพาะเมื่อสถานะ Stock Take ใน StoreHub เป็น In Progress หรือ Completed และถ้ามีรายการ +/- ต้องกรอกรายละเอียดก่อนส่งงาน · ห้ามปรับยอดในระบบก่อนหัวหน้าอนุมัติ",
  scheduleLabel: "งานประจำเดือน",
  checklist: [
    "เลือกเกมและพื้นที่นับ Single card",
    "นับจำนวนจริงตามตู้โชว์ / Stock",
    "บันทึกรายการที่ตรงและไม่ตรง",
    "แคปรูปส่งหลักฐานรายการที่ไม่ตรง",
    "สรุปรายการ +/- โดยต้องให้เจ้าของร้านตรวจ"
  ]
};

export function monthlyStockSingleManualHref() {
  return `/training#${monthlyStockSinglePhase.id}`;
}
