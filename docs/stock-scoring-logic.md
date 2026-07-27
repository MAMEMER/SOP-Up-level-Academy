# สรุป Logic การนับคะแนน — หมวด "นับ Stock"

> เอกสารสรุปวิธีคิดคะแนน KPI หมวด Stock (เต็ม 20 คะแนน) ของ Up Level Academy
> อ้างอิงโค้ดจริง — ใช้เป็น single source of truth เวลามีคำถาม/เถียงกันเรื่องคะแนน
> (Ticket: `gEMwm5SXvXtQR9b9q571` — ร้องขอโดย namenrw@gmail.com)

---

## 1. ภาพรวม

- หมวด **Stock เต็ม 20 คะแนน** (เป็น 1 ใน 5 หมวดของ KPI เต็ม 100)
- คะแนนหมวด = `20 − ผลรวมการหักทั้งหมด` (เพดานบนสุด 20, **ลงติดลบได้** ถ้าหักหนัก → ฉุดคะแนนรวมลง)
- โค้ดหลัก: `lib/performance-score.ts` → `calculateStockScore()` (บรรทัด ~246–304)

---

## 2. เกณฑ์การหักคะแนน

| เงื่อนไข | หัก | หมายเหตุ | โค้ด |
|---|---|---|---|
| **ไม่ได้นับ stock (`not_counted`)** ครั้งที่ 1–2 | −10 / ครั้ง | นับสะสมทั้งช่วงเวลาที่เลือก | `performance-score.ts:257–268` |
| **ไม่ได้นับ stock (`not_counted`)** ครั้งที่ 3 เป็นต้นไป | −5 / ครั้ง | | `performance-score.ts:259` |
| **นับ stock เช้าช้า** เกินกรอบ 4 ชม. จากเวลาเริ่มกะ | −2 | ต่อครั้งที่ช้า | `performance-score.ts:270–279`, `store-config.ts:22` |
| **StoreHub Difference ไม่เป็น 0** (`real_loss`) — ตั้งแต่ **2026-08-01** เป็นต้นไป | −2 | ต่อรายการ stock count ที่มี difference | `performance-score.ts:283–297` |
| StoreHub Difference ไม่เป็น 0 — **ก่อน 2026-08-01** | ไม่หัก (แค่ warning) | ช่วง July 2026 StoreHub ไม่นิ่ง | `performance-score.ts:286–287` |
| แก้ปัญหา difference ได้ภายใน 24 ชม. (`resolved` + `resolvedWithin24Hours`) | ไม่หัก | | `performance-score.ts:281` |
| เข้าข่ายตรวจสอบทุจริต (`fraud_review`) | ไม่หัก แต่ตั้ง flag | `management_review_required` | `performance-score.ts:299` |

### รายละเอียดแต่ละข้อ

**2.1 ไม่ได้นับ stock (`not_counted`) — หักแบบขั้นบันได**
เรียงตามวันที่ (dueDate) แล้วนับเป็น "ครั้งที่ N":
- ครั้งที่ 1 → −10
- ครั้งที่ 2 → −10
- ครั้งที่ 3, 4, 5… → −5 ต่อครั้ง

> รายการ `not_counted` ถูกสร้างอัตโนมัติเมื่อ **มีกะเช้าในวันนั้นแต่ไม่พบ StoreHub stock count ในวันเดียวกัน**
> (`performance-score-data.ts` → `missingMorningStockCountRecords()`)
> ถ้าวันนั้นมีการนับ (แม้จะช้า/ยัง In Progress) → **ไม่นับเป็น not_counted** แต่ไปโดนข้อ 2.2 (ช้า) แทน
>
> **การนับ stock เช้าถือเป็นงานของ "ร้าน" วันละครั้ง (ticket `1SZjSo2wVRZXeR5sATw9`):**
> ถ้ามี StoreHub stock count ในวันนั้น **ไม่ว่าจะถูกบันทึกในชื่อใคร** (บัญชีร้าน "Uplevel Academy"
> หรือเพื่อนร่วมกะที่ล็อกอินอยู่) → เครดิตให้ทุกคนที่มีกะเช้าวันนั้น ไม่ขึ้น not_counted.
> ก่อนหน้านี้โค้ดจับคู่เฉพาะ count ที่ StoreHub ระบุชื่อตรงกับพนักงานคนนั้น → ทำให้ Leo ขึ้น "ขาด"
> ทั้งที่ StoreHub มีการนับจริง (แต่บันทึกในชื่อบัญชีร้าน/คนเปิดร้าน). แก้แล้วให้เช็คแบบ "ต่อวันทั้งร้าน".

**2.2 นับเช้าช้าเกิน 4 ชม.**
- กรอบเวลา = เวลาเริ่มกะ (scheduledStart) + 4 ชม. (`stockCountGraceHours: 4` ต่อสาขา, ตอนนี้ตั้งไว้ที่บางแค)
- ถ้าเวลาเริ่มนับ (startedAt) เลย deadline → `slowCount = true` → หัก 2
- ตรวจเฉพาะ **กะเช้า** ที่มีการนับตรงกับวันนั้น (`performance-score-data.ts` → `annotateSlowMorningCounts()`, ~50–67; `store-config.ts` → `isSlowMorningCount()`)

**2.3 StoreHub Difference ไม่เป็น 0**
- ถ้ารายการ stock count มี `difference !== 0` ในสินค้าใดๆ → ตั้งสถานะ `real_loss`
- **ก่อน 2026-08-01:** แค่แจ้งเตือน (warning) ไม่หัก — เพราะ StoreHub ยังไม่นิ่งช่วง July 2026
- **ตั้งแต่ 2026-08-01:** หัก 2 คะแนนต่อรายการ stock count ที่มี difference
- ค่าคงที่: `STOCK_DIFFERENCE_DEDUCTION_START = "2026-08-01"` (`performance-score.ts:79–81`)

---

## 3. ที่มาของข้อมูล Stock

- อ่านจาก **StoreHub Stock Take**: https://uplevel.storehubhq.com/stocks/stocktakes
  (`lib/weekly-stock-workflow.ts:14`, `lib/monthly-stock-single-workflow.ts:14`)
- ⚠️ StoreHub Open API **ไม่มี** endpoint สำหรับ stock take → ข้อมูลมาจาก **CSV export** ที่แอดมินอัปโหลดในหน้า "คะแนนพนักงาน"
  (`lib/storehub-api.ts` หมายเหตุบรรทัด 1–6; parse ที่ `lib/storehub-stocktake-export.ts`)
- **ใช้เฉพาะแถวที่ status = `Completed` หรือ `In Progress`** (ตัด `Cancelled` ทิ้ง)
  (`lib/storehub-stocktake-export.ts:~95`; ค่าคงที่ `submittableStocktakeStatuses` ที่ `weekly-stock-workflow.ts:19`)
- **การ group แถว** — 1 รายการ (stock count) = แถวที่มีคีย์เดียวกันนี้ทั้งหมดรวมกัน:
  ```
  key = startTime | completedTime | supplier | status | startedBy | completedBy
  ```
  (`lib/storehub-stocktake-export.ts` → `mapStoreHubStockTakeRowsToCounts()`, ~93–126)
- แต่ละกลุ่มแปลงเป็น `StockCountRecord`:
  - `category` = supplier (หรือ `"StoreHub Stock Take"` ถ้าไม่มี)
  - `startedAt` / `completedAt` = แปลงจาก `MM/DD/YYYY HH:mm` → ISO (+07:00)
  - `submittedAt` = ตั้งเฉพาะเมื่อ status = `Completed`
  - `discrepancyStatus` = `real_loss` ถ้ามีสินค้าใด difference ≠ 0, ไม่งั้น = `matched`

---

## 4. จุดที่ควรรู้ / ต้องตัดสินใจ (สำหรับเจ้าของ)

1. **"ต่อ stock ที่ติดลบ" vs "ต่อรายการ"** — โจทย์เขียนว่า "หัก 2 คะแนน**ต่อ stock ที่ติดลบ**" แต่โค้ดปัจจุบันหัก **2 ต่อ 1 รายการ stock count (group)** ที่มี difference ≠ 0 (ไม่ว่าจะบวกหรือลบ ไม่ว่าจะมีกี่สินค้าในรายการนั้น). ถ้าตั้งใจให้หัก "ต่อสินค้าที่ difference ติดลบ" แบบรายชิ้น ต้องแก้ logic (เป็นการเปลี่ยนสูตรคะแนน → ขอ confirm ก่อน)
2. **บวกหรือลบ** — ปัจจุบันนับ difference "ไม่เป็น 0" ทั้งบวกและลบเป็น `real_loss` เหมือนกัน. โจทย์ใช้คำว่า "ติดลบ" → ถ้าต้องการหักเฉพาะกรณีของหาย (ติดลบ) ไม่หักกรณีเกิน (ติดบวก) ต้องแก้เงื่อนไข
3. กรอบ 4 ชม. ตั้งค่าไว้ที่สาขาบางแคสาขาเดียว (`store-config.ts`) — ถ้ามีสาขาใหม่ต้องเพิ่ม config

> ข้อ 1–2 เป็นการเปลี่ยนพฤติกรรมการคิดคะแนน (กระทบเงิน incentive) จึงยังไม่แก้ในรอบนี้ รอเจ้าของ (เนม/Champ) ยืนยันทิศทางก่อน

---

## 5. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/performance-score.ts` | สูตรคิดคะแนนทุกหมวด รวมถึง `calculateStockScore()` |
| `lib/performance-score-data.ts` | ต่อ CSV → records, สร้าง not_counted, ติด slowCount |
| `lib/storehub-stocktake-export.ts` | parse CSV + group แถวเป็น stock count |
| `lib/store-config.ts` | กรอบเวลา 4 ชม. ต่อสาขา + `isSlowMorningCount()` |
| `lib/weekly-stock-workflow.ts` / `lib/monthly-stock-single-workflow.ts` | URL StoreHub + สถานะที่ยอมรับ |
| `tests/performance-score.test.ts` | เทสสูตรคะแนน |
