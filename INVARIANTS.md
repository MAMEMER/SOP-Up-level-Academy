# INVARIANTS — SOP Website (KPI → เงินเดือน)

> **กฎห้ามหลวม.** ระบบนี้คำนวณ **KPI → หักเงินเดือนพนักงานจริง**. bug-fix ที่หลวมนิดเดียว = เงินพนักงานผิด.
> ทุก fix ที่แตะ `lib/performance-score*.ts`, `lib/owner.ts`, `lib/auth.ts`, `lib/sop-users.ts` → **ต้องพิสูจน์ว่าไม่ละเมิดกฎ** ก่อน merge.
> ถ้า diff แตะสูตรหักเงิน / auth / allow-list → **STOP → Champ approve เท่านั้น** แม้ test เขียว.

## วิธีใช้ (auto-fix / reviewer)
1. ก่อนแก้ ให้อ่านหมวดที่ตรง
2. ถาม adversarial: **"diff นี้ทำใครถูกหักเงินผิด? ใครได้คะแนนฟรี? ใครเห็นเงินเดือนที่ไม่ควรเห็น? ใคร login เข้ามาได้ทั้งที่ไม่ควร?"**
3. ถ้า "อาจได้" → ห้าม auto-deploy
4. รัน `./scripts/check-invariants.sh` ต้องผ่านก่อน commit

---

## 1. สูตรหักเงินเดือน — `lib/performance-score.ts` (L425-459) `calculateSalaryDeduction()`
- หัก **เฉพาะเมื่อ `totalScore < 50`** (L436). `totalScore >= 50` → return `amount: 0`.
- `pointsShort = Math.ceil(50 - totalScore)` — **ปัดขึ้น** (45.1 = ขาด 5 แต้ม = ฿500 ไม่ใช่ 4).
- Full-time: **฿500 ต่อแต้ม** ที่ขาด (hardcode L433). Part-time: `(pointsShort/100) × (daysWorked × dailyRate)`.
- **ห้ามหลวม:** ปลด `>= 50` guard / เปลี่ยน `Math.ceil`→`Math.floor` / แก้เลข 500 / ยอมให้ re-enter score โดยไม่ล้างของเก่า (หักซ้ำ).
- **พังถ้าละเมิด:** คนคะแนน 50+ ถูกหัก, คนถูกหักน้อยกว่าจริง, เงินเดือนพัง, หักซ้ำ.

## 2. Category scoring — `lib/performance-score.ts` (L157-163)
- แต่ละหมวด **cap ที่ 20** (max) แต่ **ไม่ floor ที่ 0** — ติดลบได้ (ตั้งใจ, KPI 23 Jul 2026 "ทุกหมวดหักได้เรื่อยๆ"). Total floor `[0,100]` (L474).
- **ห้ามหลวม:** floor หมวดที่ 0 (ซ่อนความผิดร้ายแรง) / ปลด cap 20 (คะแนนเฟ้อ) / เปลี่ยน total floor.
- **พังถ้าละเมิด:** attendance พังหนัก (-50) กลายเป็นมองไม่เห็น, คนได้ 25/หมวด.

## 3. Salary = คำนวณสด ไม่ persist — `lib/performance-score-data.ts`
- Salary deduction **คำนวณ on-the-fly** ไม่เก็บ DB. Idempotent (input เดิม → output เดิม). ไม่มี side effect เขียน Firestore.
- **ห้ามหลวม:** เพิ่ม field `salaryDeduction` ลง Firestore / cache manual override โดยไม่มี versioning / ใส่ randomness.
- **พังถ้าละเมิด:** เสียค่าคำนวณจริง, audit ไม่ได้, refresh แล้วผลไม่เท่ากัน.

## 4. Admin auth / ใครเห็น-แก้เงินเดือน — `lib/owner.ts`, `lib/sop-users.ts`, `lib/auth.ts`
- `OWNER_EMAILS` = **แค่ 2 คน** (champ + namenrw), hardcode. เงินเดือน **owner-only** ซ่อนจาก admin อื่น (`isOwner()` gate).
- Allow-list `sopUsers` = **code-based** (git ไม่ใช่ DB). Session = **HS256 JWT** ต้องมี `SESSION_SECRET`. `requireUser()` (auth.ts L21-48): ไม่มีใน allow-list → `redirect("/login?denied=1")`.
- **ห้ามหลวม:** ปลด `isOwner` (admin อื่นเห็นเงินเดือน) / ปลด `sopUserForEmail` (ใครมี Google ก็เข้า) / cache role ใน localStorage / PIN แค่ UI ไม่ enforce server / เชื่อ DB role โดยไม่ verify ต่อ request.
- **พังถ้าละเมิด:** เงินเดือนรั่ว, คนนอก login เข้า, forge role.

## 5. Firestore writes (money/salary) — `lib/performance-service-records.ts` (L126-155), `lib/firestore-rest.ts`
- Persist แค่ `sop_service_records` + `sop_assigned_records` (evidence URL, complaint count). **ไม่เก็บจำนวนเงิน**. API key public ได้เพราะ app-gate ด้วย `requireUser()`. **Upsert ไม่ increment** (ID เดิม = replace).
- **ห้ามหลวม:** ปลด `requireUser()` (ใครก็ POST complaint ปลอม) / เปลี่ยน upsert→increment (นับซ้ำ) / เพิ่ม salary field / เปิด rules โดยไม่แก้ client.
- **พังถ้าละเมิด:** คน record ความผิดปลอมใส่คนอื่น, count เบิ้ล, หักเงินผิด.

## 6. StoreHub CSV upload — `components/PerformanceScoreView.tsx` (L198-214), `lib/performance-source-files.ts` (L62-69)
- ⚠️ **ไม่มี schema validation** (รับ text อะไรก็ได้). Overwrite ไม่ append. Admin-gated. Path constrained (`stock-latest.csv`/`attendance-latest.csv`).
- **ห้ามหลวม:** ปลด admin gate / เปลี่ยนเป็น append (row ซ้ำ = หักซ้ำ) / ยอม path traversal (`../`) / parse โดยไม่ validate.
- **ควรทำเพิ่ม:** schema check + audit ว่าใคร upload version ไหน (ตอนนี้ยังไม่มี — จุดเสี่ยง).
- **พังถ้าละเมิด:** CSV attendance ปลอม (ชื่อ/เวลามั่ว) หักเงินคนบริสุทธิ์.

## 7. Evidence image attach — `components/EvidenceImageInput.tsx`
- ต้อง Google login. เช็ค `image/` client-side. cap 5MB. path มี timestamp+random (กันเดา/ชน). **evidence URL immutable ใน record**.
- **ห้ามหลวม:** ปลด image-type check / เพิ่ม size โดยไม่มี quota / ใช้ชื่อเดาได้ / ให้แก้ evidence ย้อนหลัง / Storage rule `allow write: if true`.
- **พังถ้าละเมิด:** upload ไฟล์อันตราย, เดา URL หลักฐานคนอื่น, แก้หลักฐานหลังส่ง (เสีย audit).

## 8. Stock grace period — `lib/performance-score.ts` (L79-81)
- `STOCK_DIFFERENCE_DEDUCTION_START = "2026-08-01"`. ก่อนวันนี้ **ไม่หัก** stock difference (StoreHub ไม่นิ่งช่วง July). หลังวันนี้ -2/loss.
- **ห้ามหลวม:** เลื่อนวันมา July (หักย้อนหลังไม่เป็นธรรม) / เพิ่ม penalty เกิน -2 / ปลด grace โดยไม่แจ้ง.

## 9. Checklist escalation — `lib/performance-score.ts` (L306-355)
- ขาด checklist 2 วันแรก **-10/วัน** จากนั้น **-5/วัน**. Occurrence counter **ต่อคน ไม่ reset ในรอบ**.
- **ห้ามหลวม:** reset occurrence รายสัปดาห์ (bank 2 ฟรี/สัปดาห์) / ทำทุกครั้ง -5 (เสีย incentive) / เปลี่ยน threshold 2→3.

## 10. Attendance rules — `lib/performance-score.ts` (L192-244)
- สาย ≤10 นาที = -1, สาย >10 นาที = -2, ไม่ตอก = -2. วันลาที่อนุมัติ **ไม่นับ**. หนึ่ง incident = หนึ่ง deduction.
- **ห้ามหลวม:** ตัด 10-min grace / ไม่เช็ค leave record (หักคนลาถูกต้อง) / ยอมหักหลายครั้งต่อ 1 clock event.

---
**Origin:** MAMEMER — **ห้าม push origin โดยไม่ review**. Deploy ผ่าน Netlify alias.
