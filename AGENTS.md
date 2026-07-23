# AGENTS.md — เว็บ SOP Up Level Academy

คำสั่งสำหรับ AI coding agent (Codex / Claude Code) ที่มาช่วยพัฒนา repo นี้.
อ่าน `CONTRIBUTING.md` ประกอบ (รายละเอียดเต็ม).

## โปรเจกต์
เว็บ **SOP + KPI พนักงาน** Up Level Academy. LIVE: https://sop.uplevelguild.com
**Next.js (App Router) + TypeScript + plain CSS (ไม่มี Tailwind)** · Supabase (public preview mode by default) · Firebase client เฉพาะ bug-report tickets.

## Setup + คำสั่ง
```bash
npm install
npm run dev      # localhost:3000 (รันได้เลย ไม่ต้องใส่ env/key)
npm run lint     # tsc type-check — ต้องผ่าน
npm test         # node --test — ต้องผ่านก่อน commit
npm run build    # ลอง build prod
```

## ที่อยู่ของ logic หลัก
- `lib/performance-score.ts` — ★ KPI engine (5 หมวด×20 + salary deduction). แก้แล้ว **อัปเดต tests/performance-score.test.ts เสมอ**
- `lib/performance-score-data.ts` — ต่อข้อมูลจริงเข้า KPI
- `lib/schedule-sheet.ts` — อ่านตารางกะจาก Google Sheet
- `components/` — UI (plain CSS, class ใน `app/globals.css`)

## กฎ (ห้ามพลาด)
1. **ทุก PR ต้อง `npm run lint` + `npm test` ผ่าน** ก่อน push
2. **UI = editorial โปร่ง ไม่มีกล่อง/กรอบ** · ธีม Guild (warm-pastel, font Mitr, ส้ม #FF8C42, token ท้าย `app/globals.css`) · เช็ค PC + มือถือ · ภาษาไทย · ไม่ใช้ emoji ใน UI
3. **ห้าม commit secret/key** — key อยู่ใน Vercel env เท่านั้น. Firebase config ใน `lib/firebase-client.ts` เป็น public config (ปล่อยไว้)
4. **ห้ามแตะ DNS** ของ `sop.uplevelguild.com` (ชี้ Vercel แล้ว) — อย่าตั้ง chatgpt.site/record อื่นทับ
5. **แตก branch ต่อ feature → PR → merge main** (ไม่ push ตรง main ถ้าไม่ชัวร์)
6. เขียนโค้ดให้เข้ากับของเดิม (naming/รูปแบบเดียวกัน) · comment เท่าที่จำเป็น

## Deploy
`vercel --prod` (project `sop-uplevel`, ต้องมีสิทธิ์ Vercel). main = โค้ดที่ LIVE.

## ก่อนเริ่มงาน
1. อ่าน `CONTRIBUTING.md` + โครง `lib/` + `app/`
2. รัน `npm install && npm run dev` ดูเว็บจริงก่อน
3. ยืนยันเข้าใจ scope งานกับทีมก่อนแก้ของใหญ่ (KPI logic / schema / money)
