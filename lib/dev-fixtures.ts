// ข้อมูลปลอมสำหรับดูหน้าตาบนเครื่อง dev เท่านั้น (ไม่มีกุญแจ Firestore).
// เปิดด้วย `SOP_DEV_FIXTURES=1 npm run dev` — production ไม่มีทางเข้าเงื่อนไขนี้ (NODE_ENV !== "development").

import type { CardPricesData } from "./card-prices-server.ts";
import type { RefRow } from "./card-prices.ts";
import type { CompetitorMeta } from "./competitor-events.ts";

export function devFixturesOn(): boolean {
  return process.env.NODE_ENV === "development" && process.env.SOP_DEV_FIXTURES === "1";
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fixtureCompetitorEvents(): { meta: CompetitorMeta; raw: Record<string, unknown>[] } {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return {
    meta: { updatedAt: new Date().toISOString(), count: 7, windowDays: 30 },
    raw: [
      {
        game: "pokemon", title: "Pokemon Mega Evolution League Challenge ชิงคะแนน CP", shop: "Card Lab", location: "เซ็นทรัล พระราม 2",
        bkk: true, eventType: "tournament", dates: ["2026-10-17"], times: "11:00 ลงทะเบียน · 12:00 เริ่ม", feeThb: 1250, seats: 64,
        prizes: "Top 8 ได้กล่อง Booster Box + Promo · แชมป์ได้ Playmat ลายพิเศษ และถ้วยรางวัล", doorGift: "Sleeve ลายร้าน 1 แพ็ก",
        postUrl: "https://www.facebook.com/groups/1/posts/1", ours: false
      },
      {
        game: "onepiece", title: "One Piece Store Tournament", shop: "Grand Line TCG", location: "สยามสแควร์",
        bkk: true, eventType: "tournament", dates: ["2026-10-17"], times: "13:00", feeText: "300 บาท รวม pack", seats: 32,
        prizes: "Promo pack", postUrl: "https://www.facebook.com/groups/1/posts/2"
      },
      {
        game: "lorcana", title: "Lorcana Set Championship — ชิงตั๋วไประดับประเทศ รอบคัดเลือกภาคกลาง ร้านเรามีที่นั่งจำกัดมากรีบสมัคร", shop: "ร้านการ์ดบ้านสวนเกมเมอร์ที่มีชื่อยาวมากจริงๆ", location: "นนทบุรี",
        bkk: false, eventType: "tournament", dates: [addDays(today, 1)], times: "10:00–18:00", feeThb: 450, seats: null,
        prizes: null, doorGift: "Promo card", postUrl: "https://www.facebook.com/groups/1/posts/3"
      },
      {
        game: "riftbound", title: "Riftbound Weekly", shop: "Nexus Hobby", location: "ลาดพร้าว",
        bkk: true, eventType: "weekly", dates: [addDays(today, 2), addDays(today, 9)], times: "19:00", feeThb: 200, seats: 16,
        prizes: "Booster ตามอันดับ", postUrl: ""
      },
      { game: "pokemon", title: "Pre-release Hyperia City", shop: "Poke Corner", location: "บางนา", bkk: true, eventType: "prerelease", dates: [addDays(today, 4)], feeThb: 0, postUrl: "https://www.facebook.com/groups/1/posts/5" },
      { game: "other", title: "Digimon Regional ไม่มีวันในโพสต์", shop: "DigiDen", location: "", bkk: true, eventType: "other", dates: [], feeText: "สอบถามในแชท", notes: "รอประกาศวัน" },
      { game: "pokemon", title: "งานของเราเอง (ต้องไม่โชว์)", shop: "Up Level", bkk: true, dates: ["2026-10-17"], ours: true }
    ]
  };
}

export function fixtureCardPrices(): CardPricesData {
  const row = (o: Partial<RefRow>): RefRow => ({
    id: "x", key: "k", game: "pokemon", name: "", aka: "", img: "", set: "", number: "", printing: true, lang: "TH", grade: "RAW",
    median: null, p25: null, p75: null, low: null, high: null, n: 0, buy: null, nbuy: 0, trend: null, lastAt: 1, usd: null, samples: [], ...o
  });
  const rows: RefRow[] = [
    row({ id: "r1", key: "pkm:sv2a:201", name: "Charizard ex", aka: "ลิซาร์ดอน ex", set: "SV2a", number: "201", median: 1850, p25: 1700, p75: 1950, low: 1500, high: 2200, n: 6 }),
    row({ id: "r2", key: "pkm:sv2a:185", name: "Charizard ex", aka: "ลิซาร์ดอน ex", set: "SV2a", number: "185", median: 420, n: 3 }),
    row({ id: "r3", key: "pkm:sv8:236", name: "Pikachu ex", aka: "พิคาชู ex", set: "SV8", number: "236", median: 3200, n: 5, trend: 0.12 }),
    row({ id: "r4", key: "lor:7:207", game: "lorcana", name: "Elsa - The Fifth Spirit", set: "7", number: "207", lang: "EN", median: 2400, n: 2 }),
    row({ id: "r5", key: "rb:ogn:299", game: "riftbound", name: "Jinx - Loose Cannon", set: "OGN", number: "299", lang: "EN", median: 980, n: 1 }),
    row({ id: "r6", key: "pkm:sv9:charizard", name: "Charizard Mega ex promo with a very long name that must truncate", aka: "", set: "SV9", number: "", median: 650, n: 2 })
  ];
  return {
    meta: { updatedAt: new Date().toISOString(), rows: rows.length, windowDays: 45, groups: 3, usdThb: 36 },
    rows,
    feedback: [],
    overrides: [],
    watches: []
  };
}
