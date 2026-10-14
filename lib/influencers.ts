import { z } from "zod";

export const influencerStatuses = ["ยังไม่ทัก", "ทักแล้ว", "คุยอยู่", "ตกลง", "ไม่เอา", "แพงไป"] as const;
export const influencerPlatforms = ["FB", "IG", "TikTok", "FB+TikTok"] as const;
export const influencerSchema = z.object({
  name: z.string().trim().min(1, "ใส่ชื่อช่อง").max(150),
  platform: z.enum(influencerPlatforms),
  links: z.string().trim().min(1).max(1500).refine(value => value.split(/[\s,]+/).every(link => {
    try { return ["http:", "https:"].includes(new URL(link).protocol); } catch { return false; }
  }), "ใส่ลิงก์ http หรือ https คั่นด้วยช่องว่าง"),
  followers: z.string().trim().max(100),
  content: z.string().trim().max(150),
  status: z.enum(influencerStatuses),
  rate: z.string().trim().max(500),
  contactedBy: z.string().trim().max(100),
  lastContact: z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}:00Z`)) && new Date(`${value}:00Z`).toISOString().slice(0, 16) === value),
  note: z.string().trim().max(5000)
}).strict();
export type InfluencerFields = z.infer<typeof influencerSchema>;
export type Influencer = InfluencerFields & { id: string; revision: number };
export type InfluencerHistory = { id: string; at: string; by: string; before: InfluencerFields | null; after: InfluencerFields };
export const emptyInfluencer: InfluencerFields = { name: "", platform: "TikTok", links: "", followers: "", content: "เล่นการ์ด", status: "ยังไม่ทัก", rate: "", contactedBy: "", lastContact: "", note: "" };
export const openingMessage = "สวัสดีครับ แอดมินร้าน Up Level นะครับ ชอบคลิปช่องนี้มากเลยครับ 😊";
const seeds: [string, InfluencerFields["platform"], string, string, string, InfluencerFields["status"], string?, string?, string?][] = [
  ["แรคคูนเล่นการ์ด", "TikTok", "https://www.tiktok.com/@shuffling_raccoon", "3.8K", "เล่นการ์ด", "ยังไม่ทัก", "พี่แชมป์รู้จัก ใช้ 'พี่แชมป์ฝากชวนมางาน GO'"],
  ["ISG TCG", "TikTok", "https://www.tiktok.com/@isogetvtcg", "1.8K", "เล่นการ์ด", "ยังไม่ทัก"],
  ["Hotsun's Duel Space", "TikTok", "https://www.tiktok.com/@hotsuns.duel.spac", "3.2K", "เล่นการ์ด", "ยังไม่ทัก", "ไม่แน่ใจว่าคนไทย"],
  ["scythertcgpov", "TikTok", "https://www.tiktok.com/@scythertcgpov", "19.3K", "เล่นการ์ด", "ยังไม่ทัก", "ไม่แน่ใจว่าคนไทย"],
  ["บุ๊คแกะการ์ด", "TikTok", "https://www.tiktok.com/@bookkaecard", "20K", "เปิดการ์ด", "ยังไม่ทัก", "ติดต่อ DM หรือ IG bookkysohappy"],
  ["PerdCard TCG", "TikTok", "https://www.tiktok.com/@perdcardtcg", "13.3K", "เปิดการ์ด", "ยังไม่ทัก"],
  ["SoSadCard", "TikTok", "https://www.tiktok.com/@sosadcard", "12.1K", "เปิดการ์ด", "ยังไม่ทัก"],
  ["การ์ดโปเกเกลือ", "TikTok", "https://www.tiktok.com/@pokekuea1", "6.2K", "เปิดการ์ด", "ยังไม่ทัก"],
  ["จุ่มเกลือกัน TCG", "TikTok", "https://www.tiktok.com/@bbpokemontcg", "4.1K", "เปิดการ์ด", "ยังไม่ทัก"],
  ["PokeNeko Card", "TikTok", "https://www.tiktok.com/@pokenekooo", "2.4K", "เปิดการ์ด", "ยังไม่ทัก"],
  ["Thursday TCG", "TikTok", "https://www.tiktok.com/@thursday.tcg", "82.9K", "เช็กราคา/ข่าว", "ยังไม่ทัก", "ช่องใหญ่ ถามเรท"],
  ["ปวดหลัง Gaming/จุ่มเกลือ", "FB+TikTok", "https://www.facebook.com/plgamingth https://www.tiktok.com/@saltygamerth", "96K/70.6K", "เปิดการ์ด", "แพงไป", "", "โพสต์FB 5,000 / คลิปสั้น จุ่มเกลือ 10,000 / ปวดหลัง Gaming 18,000"],
  ["Necross Melphist", "FB", "https://www.facebook.com/Necrosscha", "62K", "", "ยังไม่ทัก", "อีเมล Necross@online-station.net"],
  ["Mark Breaker", "FB", "https://www.facebook.com/MBKver2", "6.3K", "ไม่ตรงสาย", "ไม่เอา", "ช่วงนี้ทำ Labubu"],
  ["Penguin Hut", "TikTok", "https://www.tiktok.com/@pokemondocumentary", "9.2K", "เปิดการ์ด", "ทักแล้ว", "ทัก 14 ต.ค. 16:55 รอตอบ, เพจ FB ปิดแชท, อีเมล thepenguinhut@gmail.com", "", "2026-10-14T16:55"]
];
export const initialInfluencers: Influencer[] = seeds.map(([name, platform, links, followers, content, status, note = "", rate = "", lastContact = ""], index) => ({ ...emptyInfluencer, id: `seed-${index + 1}`, revision: 0, name, platform, links, followers, content, status, note, rate, lastContact }));
export function mergeInfluencers(saved: Influencer[]): Influencer[] {
  const existing = new Map(saved.map(row => [row.id, row]));
  return [...initialInfluencers.map(row => existing.get(row.id) || row), ...saved.filter(row => !initialInfluencers.some(seed => seed.id === row.id))];
}
export function matchesInfluencer(row: Influencer, status: string, platform: string, search: string): boolean {
  return (!status || row.status === status) && (!platform || row.platform.split("+").includes(platform)) && `${row.name} ${row.content} ${row.note} ${row.contactedBy}`.toLowerCase().includes(search.trim().toLowerCase());
}
