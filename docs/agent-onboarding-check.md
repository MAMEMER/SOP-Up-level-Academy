# Agent Onboarding Check — รันเอง เช็คเอง แก้เอง

> ไฟล์นี้เขียนถึง **AI coding agent (Codex)** ให้รัน checklist นี้เองทั้งหมด: รันคำสั่ง →
> เทียบผลที่ควรได้ → ถ้าไม่ผ่านให้แก้ตามข้อ "ถ้าไม่ผ่าน" → จบแล้วรายงานสรุปเป็นตาราง ✅/❌.
> ทำทีละขั้นตามลำดับ. อย่าข้าม. ไม่ต้องถามระหว่างทางถ้าแก้ตามที่ระบุได้.

## 0. Context ก่อนเริ่ม
อ่าน `AGENTS.md` + `CONTRIBUTING.md` ให้จบก่อน. โปรเจกต์ = เว็บ SOP+KPI พนักงาน (Next.js + TS + plain CSS, ไม่มี Tailwind). LIVE: https://sop.uplevelguild.com

---

## 1. Repo + ไฟล์ครบ
```bash
git rev-parse --abbrev-ref HEAD      # ควรได้ main
git pull --ff-only
test -f AGENTS.md && test -f CONTRIBUTING.md && echo "docs OK"
```
**ควรได้:** อยู่ `main`, pull สำเร็จ, พิมพ์ `docs OK`
**ถ้าไม่ผ่าน:** ถ้าไม่ได้อยู่ main → `git checkout main`. ถ้า pull ไม่ได้เพราะมี local change → `git stash` แล้ว pull ใหม่.

## 2. Node + ติดตั้ง dependencies
```bash
node -v                              # ต้อง >= 18 (แนะนำ 20+)
npm install
```
**ควรได้:** install จบไม่มี error
**ถ้าไม่ผ่าน:** ถ้า node < 18 → ติดตั้ง node 20 (nvm: `nvm install 20 && nvm use 20`). ถ้า install พัง → `rm -rf node_modules package-lock.json && npm install`.

## 3. Type-check (lint)
```bash
npm run lint
```
**ควรได้:** จบเงียบ ไม่มี error (คำสั่งจริงคือ `tsc --noEmit`)
**ถ้าไม่ผ่าน:** อ่าน error ของ tsc → แก้ type ที่ไฟล์ที่ระบุ. อย่า disable strict/ปิด check เพื่อให้ผ่าน. ถ้า error มาจากโค้ดที่ตัวเองยังไม่ได้แก้ = แจ้งทีม (baseline ต้องเขียวอยู่แล้ว).

## 4. Unit tests
```bash
npm test
```
**ควรได้:** `pass 135` · `fail 0` · `skipped 2`  (ตัวเลข pass อาจเพิ่มถ้ามีคนเพิ่ม test — สำคัญคือ **fail 0**)
- `skipped 2` = integration test ที่ต้องมีไฟล์ StoreHub CSV บนเครื่อง ops — ปกติ ข้ามได้
**ถ้าไม่ผ่าน (fail > 0):** เปิด test ที่ fail อ่าน assertion → แก้ให้ตรง. ถ้าเป็น baseline (ยังไม่ได้แตะอะไร) แล้ว fail = สภาพแวดล้อมเพี้ยน แจ้งทีมพร้อม log.

## 5. Build เหมือน prod
```bash
npm run build
```
**ควรได้:** build สำเร็จ, ลิสต์ทุก route, ไม่มี error
**ถ้าไม่ผ่าน:** อ่าน error → มักเป็น type/import ผิด → แก้แล้วรันใหม่.

## 6. รันเว็บดูจริง
```bash
npm run dev      # แล้วเปิด http://localhost:3000
```
**ควรเห็น:** dashboard, เมนูไทย (หน้าหลัก/เช็คลิสต์/คู่มืองาน), **ปุ่มลอย 2 อันมุมล่างขวา** (ม่วง=ผู้ช่วย, ส้ม=แจ้งบัค)
**ถ้าไม่ขึ้น:** ดู console/terminal error → แก้. ปุ่มลอยมาจาก `app/layout.tsx` (`<HelpChat/>`, `<BugReportFab/>`).

## 7. สิทธิ์ push (GitHub)
```bash
git checkout -b chore/access-check
git commit --allow-empty -m "access check"
git push -u origin chore/access-check
git push origin --delete chore/access-check      # ลบทิ้งถ้า push ผ่าน
git checkout main
```
**ควรได้:** push ผ่าน = มีสิทธิ์ repo
**ถ้าไม่ผ่าน (permission denied):** ขอ MAMEMER เพิ่มเป็น collaborator ที่ repo → Settings → Collaborators. (แก้เองไม่ได้ — ต้องเจ้าของ repo)

## 8. เว็บ prod ยัง LIVE
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://sop.uplevelguild.com
```
**ควรได้:** `200`

---

## รายงานสรุป (agent พิมพ์ท้ายสุด)
| # | เช็ค | ผล |
|---|---|---|
| 1 | repo/docs | ✅/❌ |
| 2 | node+install | ✅/❌ |
| 3 | lint | ✅/❌ |
| 4 | test (fail 0) | ✅/❌ |
| 5 | build | ✅/❌ |
| 6 | dev เว็บขึ้น | ✅/❌ |
| 7 | push สิทธิ์ | ✅/❌ |
| 8 | prod 200 | ✅/❌ |

- ครบ ✅ = **พร้อมพัฒนา** → รอ scope งานจากทีม (อย่าเพิ่งแก้ของใหญ่: KPI logic / schema / money โดยไม่ยืนยัน)
- มี ❌ ที่แก้เองไม่ได้ (เช่น ข้อ 7 สิทธิ์) → รายงานทีมพร้อมบอกว่าติดอะไร

## กฎย้ำ (ห้ามพลาดตอนแก้)
- ทุก PR ต้อง **lint + test ผ่าน** ก่อน push · แตก branch → PR → merge main
- UI = **editorial โปร่ง ไม่มีกล่อง** + ธีม Guild (Mitr/ส้ม) · เช็ค PC+มือถือ
- **ห้าม commit key/secret** · **ห้ามแตะ DNS** ของ sop.uplevelguild.com
