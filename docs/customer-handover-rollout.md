# ระบบส่งมอบ: checkpoint และรายการก่อนเปิดเขียน

หน้า `/admin/customer-handover` และเมนูพนักงานเพิ่มแล้ว ระบบยังเป็น **อ่านตรวจ/รอยืนยัน** ไม่ถือว่างานครบทุก phase หรือเปิดส่งมอบจริงแล้ว

## สิทธิ์
- บัญชี SOP ที่อยู่ใน allow-list จริง: read-only ค้นเบอร์ exact, ดูสินค้าข้ามแหล่ง, ประวัติสาขาที่ได้รับสิทธิ์; รายงานและประวัติปกปิดเบอร์
- แชมป์ `champ.championest@gmail.com`: read/record/correct/approveOpening ทั้งสองสาขา; approveOpening ณ checkpoint นี้ใช้ดู/ส่งออกรายการรอยืนยันเท่านั้น ไม่มี endpoint import
- ผู้อื่นต้องตั้ง `CUSTOMER_HANDOVER_GRANTS` เป็น JSON map ของอีเมล → `{permissions:["read","record","correct"],branches:["bangkae"]}` ผ่าน Vercel env หลังแชมป์รับรองรายชื่อ ไม่ผูกการเขียนกับ role admin
- ทุก API ปิดหากไม่มี signed session/Admin credentials หรือใช้ view-as; POST ตรวจ Origin และ JSON; actor มาจาก server
- `CUSTOMER_HANDOVER_EXCLUSIVE_WRITER` ต้องเป็น `true` หลังแชมป์ยืนยันปิด/เชื่อม writer เดิม จึงเขียนได้; แม้เปิด flag รายการที่ไม่มี balance approved หรือ fingerprint ไม่ตรงก็ยังถูกปฏิเสธ

## ของที่เตรียมไว้
Adapters หกแหล่ง, normalize phone, server-only reads, opening pending report, append-only event creation และ balance/reference-use transactions, partial handover/return-close/return-replace/cancel/reversal, request hash/idempotency, UI เลือก/review/receipt/history/export และร่าง keys/quantity แยกบัญชี/เบอร์/สาขา ไม่มีการแก้หรือลบออเดอร์ เงิน ลูกค้า หรือ event

รายงาน `customer-handover-opening-pending.json` สร้างจาก read-only snapshot วันที่ 14 ต.ค. 2026: 214 บรรทัด ยังไม่ใช่ยอดค้างรับที่รับรอง ไม่มีชื่อ/เบอร์เต็ม/สลิปในรายงาน ช่อง previouslyReceived/cancelled/outstanding เป็น null จนกว่าแชมป์ยืนยัน

| แหล่ง | เอกสาร/แถวต้นทาง | บรรทัดตรวจ |
|---|---:|---:|
| shop-orders | 10 | 10 |
| shop_orders | 14 | 0 (ไม่พบสินค้าที่จำแนก physical ได้) |
| set14-orders | 37 | 49 |
| bundle-orders | 39 | 43 (ชุดรอ BOM ไม่ใช่ component ยืนยัน) |
| MA6 Sheet | 28 | 27 |
| Lorcana13 Sheet | 50 | 85 (รวมรายการยกเลิกเพื่อให้เห็นเหตุผลล็อก ไม่ใช่สิทธิ์รับ) |

## งานค้างตาม phase
1. รับรอง BOM/หน่วยทุกแบบ, physical category ที่ producer ใช้จริง, allocation L13 ทุกแท็บ, Bundle pickup TRUE สองแถว, แถวไม่มีเบอร์/ทดสอบ/ซ้ำ; ผลนี้ยังไม่ใช่การรับรอง mapping
2. registry Sheet แบบรับรอง identity/locator, snapshot ที่แชมป์รับรอง, เชื่อมหลักฐาน delivery/payment โดยไม่เพิ่ม entitlement, indexing/pagination scalable (ปัจจุบัน bounded server scans ปิดเมื่อเกินขอบเขต)
3. importer opening events แบบ idempotent + snapshot approval/reconciliation; ห้ามนำ JSON รอยืนยันนี้ไป import โดยตรง ต้องกรอกเคยรับ/ยกเลิก/ระหว่างส่ง/stock-ready/หลักฐาน/ผู้รับรองก่อน ไม่มี import ในงานนี้
4. UI ยกเลิกสิทธิ์, draft ของข้อความยืนยัน/ผู้รับและแก้รายการ, member avatar+codename identity decoration, history filters/pagination และ source links ให้ครบ
5. emulator/integration ของ transaction พร้อมสองคน/timeout/retry/atomic failure, ตรวจ Firestore deployed rules/IAM ให้ collections ใหม่ไม่มี client access ก่อนเปิดเขียน; screenshot golden flow ด้วยข้อมูล fixture และอ่านจริงของ staff, กระทบยอด replay/projection; ยังไม่ได้รันการส่งมอบกับข้อมูลจริง

## Rules ที่เสนอ (ยังไม่ deploy)
ต้องใส่ใน ruleset หลักของ guild และตรวจ broad wildcard ที่อาจอนุญาต เพราะ explicit deny ไม่ override allow อีก match:

```
match /customer_handover_events/{document=**} { allow read, write: if false; }
match /customer_fulfillment_sources/{document=**} { allow read, write: if false; }
match /customer_fulfillment_balances/{document=**} { allow read, write: if false; }
match /customer_handover_reference_usage/{document=**} { allow read, write: if false; }
```

Admin SDK ข้าม rules: service account/IAM ต้องจำกัดด้วย ไม่มี claim ว่าป้องกัน project owner ลบผ่าน console ได้

## การตรวจ checkpoint
`npm run lint`, `npm test` (887 ผ่าน), `npm run build`; local preview API returns 403 without credentials; screenshots local 390/1440, Mitr และไม่เลื่อนแนวนอน ตรวจ production หลัง deploy แยกต่างหาก ห้ามถือ unit tests ว่าเป็น transaction integration

## Deployment checkpoint
Production deploy attempted with the existing Vercel credential; CLI rejected it: `The specified token is not valid`. A second check without VERCEL_TOKEN found no stored login. No deployment occurred and the live route was not claimed as verified. Resume with a valid Vercel login/token; deploy is already authorized by Champ, no second approval required.
