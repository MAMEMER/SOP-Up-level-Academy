import { z } from "zod";

export const openingCategories = ["หน้าบ้าน/สถานที่", "หลังบ้าน/ของรางวัล", "ระบบ", "ทีมงาน"] as const;
export const openingDays = ["17", "18", "ทั้งสองวัน"] as const;
const quantity = z.number().finite().min(0).max(1000000).nullable();
export const openingSchema = z.object({
  title: z.string().trim().min(1, "ใส่ชื่อรายการ").max(200),
  category: z.enum(openingCategories), day: z.enum(["", ...openingDays]),
  qtyNeeded: quantity, qtyHave: quantity,
  assignee: z.string().trim().max(150), note: z.string().trim().max(5000)
}).strict();
export type OpeningFields = z.infer<typeof openingSchema>;
export type OpeningItem = OpeningFields & {
  id: string; revision: number; done: boolean; doneBy: string | null; doneAt: string | null;
  createdBy: string; createdAt: string | null; updatedBy: string; updatedAt: string | null; deleted: boolean;
};
export type OpeningHistory = { id: string; at: string; by: string; action: string; before: OpeningItem | null; after: OpeningItem };
export const emptyOpening: OpeningFields = { title: "", category: openingCategories[0], day: "ทั้งสองวัน", qtyNeeded: null, qtyHave: null, assignee: "", note: "" };
export function newOpening(id: string, fields: OpeningFields, by: string, at: string | null): OpeningItem {
  return { ...fields, id, revision: 0, done: false, doneBy: null, doneAt: null, createdBy: by, createdAt: at, updatedBy: by, updatedAt: at, deleted: false };
}
export function stampOpening(item: OpeningItem, done: boolean, by: string, at: string): OpeningItem {
  return { ...item, done, doneBy: done ? by : null, doneAt: done ? at : null, updatedBy: by, updatedAt: at };
}
const titles = [
  ["โต๊ะ", "เก้าอี้", "พรม", "ปลั๊กไฟ", "ป้ายตารางเวลา/ป้ายบอกทาง", "บูธเช็กอิน/รับรางวัล", "บอร์ดสอยดาว", "โซน Learn to Play"],
  ["รางวัลแข่ง PKM", "รางวัลแข่ง Lorcana", "รางวัลแข่ง Riftbound", "รางวัลแรงค์สมาชิก 1-10", "ของสอยดาว", "รางวัล Stamp Rally", "รางวัล Lucky Draw", "ของแจกลงทะเบียน 144 ชุด", "Pre-release kit Hyperia City (ตัดสินใจจัด/เลื่อน)", "ชุด 13 สำหรับ Pack Rush", "ตั๋วบอร์ดเกม (รอลายเซ็น)", "ตั๋วจอดรถ", "เงินทอน"],
  ["ระบบเช็กอินหน้าร้าน", "Lucky Draw ทุกชั่วโมง 12:00-20:00", "จ่ายก่อนล็อกที่ + สิทธิ์ Gold/Silver + ตรวจสลิป", "Pairing Swiss 6 รอบ + Top 8 ทั้ง 3 เกม", "Court สรุปผล", "POS/QR รับเงิน", "Wi-Fi", "LINE OA"],
  ["แบ่งคน judge 3 เกม", "ผู้สอนเล่น", "บูธ", "แคชเชียร์", "MC Lucky Draw", "ยืนยันเวลาสอยดาว", "แก้เวลา Top 8 ในแผน", "ประกาศบางแคปิด 17-18 ต.ค."]
];
export const initialOpeningItems: OpeningItem[] = titles.flatMap((group, category) => group.map((title, index) => newOpening(`seed-${category}-${index}`, {
  ...emptyOpening, title, category: openingCategories[category],
  day: /Lorcana|Pre-release|Pack Rush/.test(title) ? "17" : /PKM|Riftbound/.test(title) ? "18" : "ทั้งสองวัน",
  qtyNeeded: title === "โต๊ะ" ? 43 : title === "ของแจกลงทะเบียน 144 ชุด" ? 144 : null,
  note: title === "โต๊ะ" ? "นอกร้าน 36 + ในร้าน 7 ตามแผน" : title === "ของแจกลงทะเบียน 144 ชุด" ? "บัตรสแตมป์ ถุงผ้า น้ำดื่ม" : ""
}, "รายการเริ่มต้น", null)));
// Virtual seeds match Influencer Tracker: reads never bulk-write, and tombstones prevent resurrection.
export function mergeOpeningItems(saved: OpeningItem[]): OpeningItem[] {
  const rows = new Map(initialOpeningItems.map(row => [row.id, row]));
  for (const row of saved) rows.set(row.id, row);
  return [...rows.values()];
}
export function filterOpeningItems(rows: OpeningItem[], status = "", day = ""): OpeningItem[] {
  return rows.filter(row => !row.deleted && (!status || (status === "done" ? row.done : !row.done)) && (!day || row.day === day || (day !== "ทั้งสองวัน" && row.day === "ทั้งสองวัน")));
}
export function openingProgress(rows: OpeningItem[]) {
  const count = (items: OpeningItem[]) => ({ done: items.filter(row => row.done).length, total: items.length });
  const active = rows.filter(row => !row.deleted);
  return { overall: count(active), categories: openingCategories.map(category => ({ category, ...count(active.filter(row => row.category === category)) })) };
}
