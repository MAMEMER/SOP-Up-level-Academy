# StoreHub Supply Needs → แจ้งเตือนสินค้าใกล้หมดอัตโนมัติใน SOP

## เป้าหมาย
เดิมเจ้าของร้านต้อง copy CSV จากหน้า StoreHub Supply Needs มาวางเองใน SOP ทุกวัน.
ฟีเจอร์นี้ทำให้ SOP **ดึงรายการสินค้าใกล้หมดมาแสดงเป็นแจ้งเตือนอัตโนมัติ** ในขั้นตอน
"แจ้งเตือนสินค้าใกล้หมด" ของ checklist นับสต็อก — พนักงานเห็นชื่อสินค้า + จำนวนที่เหลือ
แล้วสั่งของได้เลย และกด "ใช้รายการนี้เป็นสรุป" เพื่อเติมช่องสรุปให้อัตโนมัติ.

## ทำไมไม่ใช้ StoreHub Open API ตรง ๆ
StoreHub Open API (`api.storehubhq.com`, Basic auth) **ไม่มี endpoint สำหรับ stock / supply-needs**
(ยืนยันจากงานเดิม — มีแค่ employees / timesheets / transactions). ข้อมูล Supply Needs อยู่ในหน้า
backoffice `https://uplevel.storehubhq.com/stocks/supplyNeeds` เท่านั้น.

จึงใช้วิธี **feed URL ที่ตั้งค่าได้**: ชี้ไปที่ลิงก์ export (JSON หรือ CSV) ของ Supply Needs
แล้วระบบดึง → กรองเฉพาะรายการใกล้หมด → แสดงใน SOP.

## วิธีตั้งค่า (ทำครั้งเดียว)
ตั้ง env บน Vercel project `sop-uplevel`:

| ตัวแปร | ค่า |
| --- | --- |
| `STOREHUB_SUPPLY_NEEDS_URL` | ลิงก์ export ของ Supply Needs (JSON หรือ CSV) |
| `STOREHUB_SUPPLY_NEEDS_TOKEN` | (ถ้าต้องใช้) Bearer token ของ feed — เว้นว่างได้ถ้าลิงก์เปิด public |

ตัวเลือกแหล่ง feed:
1. **StoreHub scheduled export** — ตั้ง export Supply Needs เป็นลิงก์ CSV/JSON.
2. **Google Sheet** — วางข้อมูล Supply Needs ในชีต แล้ว File → Share → Publish to web → CSV,
   เอาลิงก์ `.../pub?output=csv` มาใส่. (เหมาะสุดถ้ายังต้อง copy อยู่ช่วงแรก — วางในชีตแทนวางใน SOP
   ทีละวัน แล้วจากนั้นค่อยทำ export อัตโนมัติเต็มรูปแบบ.)

## รูปแบบข้อมูลที่รองรับ
- **JSON**: array ของ object หรือ object ที่ห่อด้วย `supplyNeeds` / `products` / `items` / `data` / `inventory` / `rows`.
- **CSV**: บรรทัดแรกเป็นหัวตาราง.
- ชื่อคอลัมน์ยืดหยุ่น (จับได้หลายแบบ):
  - ชื่อสินค้า: `productName`, `name`, `title`, `สินค้า`, `ชื่อสินค้า`, ...
  - จำนวนคงเหลือ: `stockOnHand`, `quantityOnHand`, `quantity`, `qty`, `คงเหลือ`, `จำนวนที่เหลือ`, ...
  - จุดสั่งซื้อ (ถ้ามี): `reorderPoint`, `warningStock`, `minStock`, `จุดสั่งซื้อ`, ...

## เกณฑ์ "ใกล้หมด"
คงเหลือ ≤ จุดสั่งซื้อ (ถ้า feed มีคอลัมน์จุดสั่งซื้อ) มิฉะนั้นใช้ค่าเริ่มต้น ≤ 5.
ปรับได้ผ่าน query `?threshold=N` ที่ `/api/storehub/supply-needs`.

## ถ้ายังไม่ได้ตั้งค่า
UI จะแสดงข้อความ "ยังไม่ได้ตั้งค่าดึงอัตโนมัติ — เปิด StoreHub Supply Needs แล้วสรุปเอง"
และยังใช้ปุ่มเปิด StoreHub + ช่องกรอกสรุปแบบเดิมได้ (ไม่พังของเดิม).

## ไฟล์ที่เกี่ยวข้อง
- `lib/storehub-supply-needs.ts` — parse + filter (มี unit test)
- `app/api/storehub/supply-needs/route.ts` — API (ต้อง login)
- `components/WorkflowChecklist.tsx` — `SupplyNeedsAlert` (UI แจ้งเตือน)
- `tests/storehub-supply-needs.test.ts`
