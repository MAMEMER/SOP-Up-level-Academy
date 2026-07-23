# CONTRIBUTING — เว็บ SOP Up Level Academy

คู่มือสำหรับคนที่มาช่วยพัฒนาต่อ อ่านให้จบก่อนเริ่ม 🙏

---

## เว็บนี้คืออะไร
เว็บ **SOP + KPI พนักงาน** ของ Up Level Academy (คู่มืองาน · checklist · ตรวจงาน · คะแนนพนักงาน)
- **LIVE:** https://sop.uplevelguild.com
- Repo: `github.com/MAMEMER/SOP-Up-level-Academy` — branch หลัก `main` (= โค้ดที่ LIVE)

## Tech stack
- **Next.js (App Router) + TypeScript** — plain CSS (**ไม่มี Tailwind**)
- **Supabase** (Postgres/Auth) — แต่ default รันแบบ **public preview** ไม่ต้องต่อ DB ก็ได้
- **Firebase** (client) — ใช้แค่ส่ง bug report เข้า Firestore `tickets` (config เป็น public)
- Test: `node --test` (ไม่มี jest)

---

## เริ่มต้น (5 นาที)
```bash
git clone https://github.com/MAMEMER/SOP-Up-level-Academy
cd SOP-Up-level-Academy
npm install
npm run dev          # เปิด http://localhost:3000
```
รันได้เลยแบบ preview mode — เห็น dashboard/checklist/คะแนนพนักงาน โดยไม่ต้อง login/ไม่ต้องใส่ key

**คำสั่งอื่น**
```bash
npm run lint         # tsc type-check
npm test             # unit tests (ต้องผ่านก่อน push)
npm run build        # ลอง build เหมือน prod
```

---

## โครงโปรเจกต์
```
app/                     # หน้าเว็บ (App Router)
  (dashboard)/           #   หน้าหลัง login: /, /checklist, /tasks, /admin/*
  performance-score/     #   หน้าคะแนน (public)
  api/                   #   API routes (help-chat, storehub, task-runs)
components/              # React components (AppShell, BugReportFab, HelpChat, ...)
lib/                     # logic ล้วน (มี test) — หัวใจอยู่ที่นี่
  performance-score.ts   #   ★ เครื่องคิด KPI (5 หมวด × 20 + หักเงิน)
  performance-score-data.ts  # ต่อข้อมูลจริง (schedule/StoreHub/manual) เข้า KPI
  schedule-sheet.ts      #   อ่านตารางกะจาก Google Sheet (tab KPI)
  employee-directory.ts  #   ตารางชื่อพนักงานกลาง (map ข้ามระบบ)
  store-config.ts        #   เวลาเปิดร้าน (คิด slow-count)
tests/                   # unit tests — คู่กับไฟล์ใน lib/
docs/                    # เอกสาร (เช่น schedule-clean-tab.md)
supabase/migrations/     # schema DB
```

## เรื่องที่ต้องรู้ (สำคัญ)
- **KPI logic** อยู่ที่ `lib/performance-score.ts` — spec ล่าสุด (21.7.69): 5 หมวดเต็ม 100, incentive, หักเงินถ้า <50. แก้ตรงนี้แล้ว**อัปเดต test ด้วยเสมอ**
- **ตารางกะ** จัดใน Google Sheet (tab `วางแผน` grid → `KPI` flat อัตโนมัติ) — ดู `docs/schedule-clean-tab.md`. reader พร้อมแต่ยังไม่ wire เข้า pipeline (รอข้อมูลจริง ส.ค.)
- **StoreHub** ไม่มี API สำหรับ timesheet/stocktake → ใช้ **อัปโหลด CSV** ในหน้าคะแนนพนักงาน
- integration test 2 ตัว **skip** เพราะต้องมีไฟล์ StoreHub CSV จริง (มีบนเครื่อง ops)

---

## กฎ UI (อย่าทำผิด)
- **ธีม Up Level Guild** — warm-pastel, font **Mitr**, สีส้ม `#FF8C42` (ดู token ท้าย `app/globals.css`)
- **ห้ามใช้กล่อง/กรอบ** — layout เป็น **editorial โปร่ง** (คั่นด้วยเส้นบาง ไม่ใช่ card frame)
- **เช็คทั้ง PC + มือถือ** ก่อน push งาน UI (mobile-first)
- ภาษาไทยเป็นหลัก, ไม่ใช้ emoji ใน UI หลัก

## กฎความปลอดภัย (ห้ามพลาด)
- **ห้าม commit secret/key** ลง repo — key อยู่ใน Vercel env เท่านั้น (`ANTHROPIC_API_KEY` ฯลฯ)
- Firebase config ที่ hardcode ใน `lib/firebase-client.ts` เป็น **public config** (ปลอดภัย, กันด้วย Firestore rules) — อย่าเอา service-account/private key มาใส่
- **DNS:** `sop.uplevelguild.com` ชี้ Vercel แล้ว — **อย่าไปเพิ่ม record chatgpt/อื่นทับ** (เว็บจะล่ม)

---

## วิธีทำงานร่วม (workflow)
```
1. git checkout -b feature/ชื่อ-งาน        # แตก branch จาก main
2. แก้ code → npm run lint && npm test     # ต้องผ่าน
3. git commit → git push -u origin feature/ชื่อ-งาน
4. เปิด Pull Request → review → merge เข้า main
```
- **ไม่ push ตรงเข้า main** ถ้าไม่ชัวร์ — ใช้ PR
- 1 branch = 1 งาน · commit message สั้นบอกว่าทำอะไร

## Deploy
ตอนนี้ deploy **manual** (ใต้บัญชี Vercel ของทีม, project `sop-uplevel`):
```bash
vercel --prod        # ต้องมีสิทธิ์ Vercel project (ขอ invite)
```
> อยากได้ **auto-deploy** (push main แล้วขึ้นเอง): เจ้าของ repo ติดตั้ง **Vercel GitHub app** บน repo นี้ + เพิ่มทีมเข้า Vercel project `sop-uplevel` แล้วมันจะ deploy อัตโนมัติทุก push

## ต้องการสิทธิ์อะไรบ้าง
- **GitHub:** collaborator บน repo (push/PR)
- **Vercel:** invite เข้า project `sop-uplevel` (ถ้าจะ deploy เอง)
- **Google Sheet ตารางกะ / StoreHub / Firebase console:** ขอจากทีมตามงานที่ทำ

มีคำถามถามในกลุ่มได้เลย 🚀
