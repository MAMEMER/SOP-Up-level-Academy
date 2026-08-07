export type WeeklyStockPhase = {
  id: string;
  title: string;
  timeLabel: string;
  category: "stock";
  icon: string;
  goal: string;
  caution: string;
  scheduleLabel: string;
  checklist: string[];
  /** กะที่รับผิดชอบ — ป้ายกะ (owner override at /admin/checklist-config/weekly). ว่าง = ไม่ระบุ */
  shiftLabel?: string;
};

// ลิงก์ระบบ StoreHub Stock Take (นับ Stock อุปกรณ์ / Sleeve)
export const storehubStocktakesUrl = "https://uplevel.storehubhq.com/stocks/stocktakes";
// ลิงก์ Google Sheet ห้อง Stock (ทำเผื่อไว้ ปัจจุบันมีสินค้าแค่หน้าร้าน)
export const stockRoomSheetUrl =
  "https://docs.google.com/spreadsheets/d/1hZcCPfbjEsKTVnLxSrb75HnPdv8ZcGQyvaB5BEa5Vyk/edit?gid=0#gid=0";

// สถานะ Stock Take ที่อนุญาตให้ส่งงานได้
export const submittableStocktakeStatuses = ["In Progress", "Completed"] as const;
export const stocktakeStatusOptions = ["In Progress", "Completed", "Cancelled"] as const;

export const weeklyStockSleevePhase: WeeklyStockPhase = {
  id: "stock-sleeve-work",
  title: "Stock อุปกรณ์ / Sleeve",
  timeLabel: "งานประจำสัปดาห์ · ตามเวลาเปิด-ปิดร้าน",
  category: "stock",
  icon: "SL",
  goal: "นับ Stock อุปกรณ์ / Sleeve ประจำสัปดาห์ (Sleeve, Deck box และอุปกรณ์เสริม) โดยตรวจของจริงทั้งหน้าร้านและห้อง Stock แล้วสรุปของที่ใกล้หมดหรือที่ต้องสั่งเพิ่ม",
  caution: "ส่งงานได้เฉพาะเมื่อสถานะ Stock Take ใน StoreHub เป็น In Progress หรือ Completed และต้องแนบรูปแคปหน้า StoreHub หลังนับเสร็จ",
  scheduleLabel: "งานประจำสัปดาห์",
  checklist: [
    "ดึงข้อมูลจำนวนอุปกรณ์ / Sleeve จากระบบ StoreHub",
    "นับจำนวนจริงหน้าร้านและห้อง Stock",
    "สรุปรายการอุปกรณ์ / Sleeve ทั้งหมด",
    "สรุปรายการอุปกรณ์ / Sleeve ที่ตรงและไม่ตรง"
  ]
};

export function weeklyStockManualHref() {
  return `/training#${weeklyStockSleevePhase.id}`;
}

// งาน Stock รายสัปดาห์ที่แสดงเป็นกลุ่มบน dashboard (หมวด Stock work)
// เก็บเป็น array เพื่อให้แอดมินแก้/เพิ่ม/ลบ ได้ง่าย โดยไม่ต้องแก้ UI
export type WeeklyStockTask = {
  id: string;
  name: string;
  href: string;
  note?: string;
};

export const weeklyStockTasks: WeeklyStockTask[] = [
  {
    id: "weekly-stock-sleeve",
    name: "Sleeve / อุปกรณ์ทั้งหมด",
    href: `/checklist-weekly#${weeklyStockSleevePhase.id}`,
    note: "นับ Sleeve และอุปกรณ์เสริมทั้งหมดประจำสัปดาห์"
  },
  {
    id: "weekly-stock-booster-box",
    name: "Booster box / Box all cards",
    href: `/checklist-weekly#${weeklyStockSleevePhase.id}`,
    note: "นับ Booster box และกล่องการ์ดทั้งหมดประจำสัปดาห์"
  }
];
