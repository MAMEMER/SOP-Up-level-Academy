# แผนระบบส่งมอบสินค้าให้ลูกค้า

สถานะ: **รออนุมัติจากแชมป์** · สำรวจ 14 ตุลาคม 2026 (Asia/Bangkok)

เอกสารเสนอแผนเท่านั้น ไม่ได้สร้างระบบ แก้ข้อมูลจริง เปลี่ยน rules หรือ deploy

## ข้อเสนอสำหรับตัดสินใจ

เพิ่มหน้า `/admin/customer-handover` บน SOP ให้ผู้มีสิทธิ์ค้นด้วยเบอร์โทร เห็นสินค้าจากทุกแหล่ง เลือกเฉพาะชิ้นและจำนวนที่ส่งมอบ แล้วได้เลขบันทึกพร้อมผู้ทำรายการ สาขา และเวลา ประวัติใช้คอลเลกชันใหม่ที่เพิ่มได้อย่างเดียว ไม่แก้สถานะเงิน ไม่เขียนทับออเดอร์ต้นทาง และไม่รวมยอดจากเอกสารจ่ายเงินซ้ำกับออเดอร์

ประมาณงาน 9–13 วันทำงานสำหรับหนึ่งคน รวมเชื่อมทุกแหล่ง ทดสอบ และตรวจยอดเก่า แต่ไม่รวมเวลารอแชมป์อนุมัติยอดตั้งต้นหรือการเปิดใช้จริง แบ่งทำเป็นช่วงให้ตรวจได้ก่อนเปิดเขียน

## สำรวจข้อมูลจริง

อ่านรายชื่อ root collections และ count จาก Firestore `up-level-guild` ด้วย Admin SDK แบบ read-only; อ่านโครงสร้างตัวอย่างไม่เกิน 12 เอกสารต่อคอลเลกชัน และตรวจ status/ฟิลด์ส่งมอบของคอลเลกชันออเดอร์หลักครบทุกเอกสารด้วย field projection จำนวนต่อไปนี้เป็นจำนวนเอกสาร ณ เวลาตรวจ ไม่ใช่ยอดค้างรับหรือจำนวนลูกค้า

| แหล่ง | พบจริง | ข้อมูลที่ใช้ | การรับของเดิม / ข้อควรระวัง |
| --- | ---: | --- | --- |
| `shop-orders` | 10 | `customer.phone`, `customer.name`, `items[].sku/name/qty/pieces`, `product`, `qty`, `freePieces`, `totalPieces` | ทั้ง 10 `status=confirmed`; 9 มี `shippedAt`; มี `shippedBy`, `trackingNumber`, `trackingPhotos`, `shippedRecordedAt` จ่ายแล้วดู `slipStatus=paid` ร่วมด้วย ส่งพัสดุแล้วไม่แปลว่าลูกค้ารับแล้ว |
| `delivery_tasks` | 9 | `orderId` ชี้ `shop-orders`, `customerPhone`, `itemsSummary`, `itemCount`, `branch` | ทั้ง 9 `status=shipped`; มี `claimedBy/At`, `handedOffBy/At`, `shippedBy/At`, tracking เป็นใบงานของออเดอร์เดิม ห้ามนับเป็นออเดอร์อีกชุด และไม่มีรายการรับบางส่วนราย SKU |
| `shop_orders` | 14 | `userPhone`, `uid`, `itemId`, `itemName`, `itemCategory`, `currency`, `effectType` | ทั้ง 14 `fulfilled` มี `fulfilledAt`, `fulfilledBy`; มีทั้ง fulfill อัตโนมัติและโดยแอดมิน ต้องแยกสินค้าจับต้องได้จากสิทธิ์/ดิจิทัล ไม่ตีความ fulfilled เป็นรับหน้าร้านทุกกรณี |
| `set14-orders` | 37 | `phone`, `name`, `reservationId`, `items[].productId/name/price/position`, `fulfillment` | ทั้ง 37 `paid`; ไม่พบฟิลด์รับของในตัวอย่าง และไม่มี `shippedAt/fulfilledAt` ใน projection ที่อ่านครบ ไม่มี qty ในรูปแบบ items ที่ตรวจ ต้องยืนยันกติกาหนึ่งรายการต่อหนึ่งหน่วยจาก producer ก่อนเปิดใช้ |
| `set14-reservations` | 37 | การจอง, `orderId`, `paidAt`, items, phone | ไม่ใช่ออเดอร์เพิ่มอีก 37; จับคู่ด้วย orderId/reservationId |
| `bundle-orders` | 39 | `phone`, `name`, `items[].bundleId/bundleName/price/position` และรูปแบบเก่า `bundleId/bundleName`, `fulfillment` | ทั้ง 39 `paid`; ไม่พบฟิลด์รับของในตัวอย่าง และไม่มี `shippedAt/fulfilledAt` ใน projection ครบ ต้องแยก Deck/Sleeve กับ Box ที่รับต่างวัน |
| `bundle-reservations` | 44 | จองชั่วคราว/จ่ายแล้ว/หมดอายุ, `orderId` | เป็นวงจรจอง ไม่รวมเป็นสิทธิ์รับซ้ำกับ orders |
| `ma6-remain-payments` | 25 | `phone`, `rows`, `boxes`, `paymentId`, status | ทั้ง 25 paid เป็นการชำระยอดที่เหลือ ออเดอร์ต้นทางอยู่ Google Sheet ไม่ใช่เอกสารรับของ |
| `lorcana13-remain-payments` | 4 | `phone`, `rows`, `items` แบบข้อความ, `paymentId`, status | ทั้ง 4 paid เป็นหลักฐานชำระของรอบหนึ่ง ไม่ครอบคลุมออเดอร์/สินค้าทั้งหมด |
| `lorcana13-credit-closures` | 3 | `rows`, `cancelledItems[].name/qty`, `creditUsed`, `stillOwed`, `by`, `at` | เป็นบันทึกปิดยอดด้วยเครดิต ไม่ใช่การส่งมอบ ห้ามสร้างสิทธิ์รับ Beast Gift Box ที่ถูกยกเลิก |

คอลเลกชันประกอบที่พบ: `bundle-preorders` 4, `bundle-claims` 86, `bundle-reviews` 3, `set14-products` 4, `set14-claims` 98, `set14-reviews` 5, `set14-reminders` 20 และ analytics `bundle_events`, `set14_events` ไม่ใช่ออเดอร์ ไม่รวมในยอดค้างรับ ไม่พบ root collection ชื่อ `ma6-orders` หรือ `lorcana13-orders` ในการ list ครั้งนี้ ไม่ได้หมายความว่าไม่มีข้อมูลในระบบอื่น

### Google Sheet ซึ่งเป็นต้นทางจริง

อ่านด้วย OAuth scope `spreadsheets.readonly` สำเร็จ (ไม่มีการเขียนชีต) ไม่บันทึกชื่อ เบอร์ สลิป หรือข้อมูลลูกค้าจริงลงเอกสารนี้

| ระบบ | Sheet / แท็บ | ยืนยันได้ |
| --- | --- | --- |
| MA6 | `1QeoXLtY1NgFkuCX_x3PFwRf9JqfI7jpP2lJv6dx1XEc` / `Form Responses 1` | มี 28 แถวหลังหัวตาราง; โทร D, จำนวน Box E, วิธีรับ F, สถานะ J, หมายเหตุ K, ชำระส่วนเหลือ L:P, ยอดสตางค์ Q ไม่พบคอลัมน์รับของโดยเฉพาะในหัวตาราง |
| Lorcana 13 | `1IpEqQgX6IuMoENzD1lfR8BsfBwgecGYHUD5WDqSlyiM` / `Responses` | มี 50 แถวหลังหัวตาราง (รวมแถวสรุป/ที่ไม่ใช่ออเดอร์ได้); โทร C, วิธีรับ D, SKU F:L, สถานะ U, Allocated JSON X, ยอดสุทธิ Y, ยอดรอบนี้ Z, สถานะรอบนี้ AC, รอบ AD; มีแท็บ `จัดสรร & คืนเงิน`, `Dashboard`, `เก็บยอดคงเหลือ` |
| Bundle | `1calCMz1y60UC_RQkxJHi-CSlUmeyw4zWvIjdwBLl-sQ` / `ติดตามการรับของ` | หัวตารางมี orderId, เบอร์, สินค้า, รับล็อตแรก G, รับ Box H, วันที่รับ I, หมายเหตุ J; ช่วงที่อ่านคืน 1,040 แถวหลังหัวตารางซึ่งรวมช่อง checkbox ที่เตรียมไว้ **ไม่ใช่ 1,040 ออเดอร์**; พบ TRUE ใน G สองแถว และ H ศูนย์แถว ยังต้องจับคู่ orderId และคัดแถวทดสอบก่อนรับรองยอด |

ข้อจำกัด: ตรวจหัวตารางและข้อมูลที่ตัวอ่านใช้ได้แล้ว แต่ยังไม่ได้รับรองประวัติรับของเก่าของลูกค้าแต่ละราย หรือกระทบยอดทุกแท็บ Lorcana 13 ไม่ถือช่องว่าง/FALSE ว่าไม่เคยรับของ ต้องให้เจ้าของรับรองยอดตั้งต้นก่อนเปิดให้ส่งมอบ

### หน้าที่เกี่ยวข้องใน SOP และโค้ดอ้างอิง

- หน้าแรก `app/(dashboard)/page.tsx:55` มี DeliveryOrdersBoard สำหรับสาขา senafest, component `components/DeliveryOrdersBoard.tsx` และ `/api/delivery-tasks` เป็นงานแพ็ค/ส่งออนไลน์ ไม่ใช่ประวัติลูกค้ารับรายชิ้น
- `/parcels` และ `/parcels/guide` ใช้ `sop_parcel_orders` สำหรับร้านรับพัสดุการ์ดจากผู้ขาย เป็นคนละทิศทางกับส่งสินค้าให้ลูกค้า
- ยังไม่พบหน้าค้นเบอร์แล้วรวมค้างรับข้ามทุกระบบจากการสำรวจ routes และ lib/components ที่เกี่ยวข้อง
- `lib/delivery-tasks-server.ts:31` นิยามสอง collection; บรรทัด 94 เป็นต้นไปใช้ confirmed หรือ slipStatus paid (ยกเว้น rejected) จัดงานส่งเฉพาะช่วงย้อนหลัง 5 วัน จึงใช้ feed นี้เป็นยอดค้างรับทั้งหมดไม่ได้
- **ไม่เปิดหน้าแรก live หรือ GET `/api/delivery-tasks`**: โค้ดเรียก `syncDeliveryTasks` แล้วเขียนข้อมูลระหว่าง GET ได้ จึงตรวจ repository และ Firestore โดยตรงตามข้อห้ามแก้ข้อมูลจริง ไม่ได้อ้างว่าทดสอบหน้าจอ live แล้ว
- ฝั่ง landing: `api/set14-confirm.js`, `api/bundle-confirm.js`, `api/_lib/sheets.js` (`appendPickupRow`), `api/_lib/ma6.js`, `api/_lib/lorcana13.js`, `api/order-shipped.js`; ฝั่ง guild: `src/lib/actions/shop-actions.ts`, `admin-shop-actions.ts` ใช้อธิบาย schema และความหมายสถานะ
- เอกสารเดิมบอก Supabase/Firebase เฉพาะ tickets แต่โค้ดปัจจุบันมี Firebase Admin และ SOP session แล้ว (`lib/firebase-admin.ts`, `lib/auth.ts`, `lib/api-firestore.ts`) ยึดโค้ดที่ตรวจจริงเป็นฐาน

## หลักรวมข้อมูลและคำนวณค้างรับ

1. สร้าง adapter แยกหกระบบ: shop-orders, shop_orders, Set14, Bundle, MA6 Sheet, Lorcana13 Sheet ให้ผลรูปแบบเดียวกัน อ้างอิง delivery_tasks และ payments เป็นหลักฐานประกอบ ไม่เพิ่ม entitlement
2. normalize เบอร์ไทยเป็นรูปแบบเดียว (รองรับ 0/+66/เว้นวรรค/ขีด; เก็บต้นฉบับเฉพาะฝั่งที่มีสิทธิ์) ค้น exact normalized phone ไม่ใช้การจับท้ายเลขแบบกว้าง; shared phone แสดงแยกออเดอร์ให้ยืนยัน ไม่ merge คนเงียบ ๆ; ข้อมูลไม่มีเบอร์ให้เข้าคิวตรวจสอบด้วย orderId
3. `sourceKey` = ระบบ + path ออเดอร์ที่แท้จริง; lineKey ใช้ ID ที่คงที่ ไม่ใช้ชื่อสินค้าอย่างเดียว; order/reservation/payment เดียวกันมี canonical key เดียวกัน SKU ซ้ำหลายบรรทัดต้องมี occurrence ID
4. Bundle สร้าง component entitlement จากแผนผัง bundle version ที่ตรวจของจริง เช่น Deck แต่ละแบบ, Sleeve, Box พร้อมตัวคูณ ห้ามเดา composition จากชื่อหรือ pickupNote; ชิ้น/แพ็ก/บ็อกซ์เก็บหน่วยแยกกัน shop-orders ต้องตรวจ qty/pieces/ของแถมจาก producer และ fixture ก่อนคำนวณ
5. MA6/L13 ใช้ Sheet เป็นออเดอร์; payment.rows ใช้จับคู่ ไม่ใช้ paymentId เป็นออเดอร์ใหม่ ชีตไม่มี immutable ID: เสนอ registry ใหม่ที่ตรึง ID จาก sheetId + tab + timestamp + normalized phone + fingerprint และเก็บ row locator แยกต่างหาก ตรวจ collision/แถวเลื่อน/เนื้อหาเปลี่ยนแล้วหยุดบรรทัดนั้นให้ตรวจ ห้ามใช้เลขแถวเป็น identity ถาวร
6. แยก **สิทธิ์สินค้า / สถานะจ่ายเงิน / สต็อกพร้อม / การส่งพัสดุ / รับจริง** เป็นคนละแกน ชำระครบอย่างเดียวไม่ยืนยันสต็อกหรือรับแล้ว; มัดจำค้าง/รอสลิป/จัดสรรไม่ชัด แสดงให้เห็นแต่ปิดปุ่มส่งมอบ
7. ค้างรับ = จำนวนสิทธิ์ที่รับรอง − ยกเลิกสิทธิ์ − ส่งมอบสุทธิ โดยส่งมอบสุทธิ = ส่งมอบ − คืนที่เปิดสิทธิ์รับใหม่ ± รายการกลับรายการ; ทุกจำนวนเป็นจำนวนเต็มและห้ามติดลบ มีของที่ส่งพัสดุแล้วแยก “ส่งแล้ว รอยืนยันรับ” และกันไม่ให้รับหน้าร้านซ้ำ
8. ประวัติเดิมไม่ชัดใช้ “ยังไม่ยืนยันยอดตั้งต้น” ไม่ตีความว่าใหม่ทั้งหมด; TRUE ใน Bundle อาจสรุปหลาย component และไม่มีเวลารับ ต้องบันทึกแหล่งหลักฐาน/ความไม่แน่นอน ห้ามสร้างเวลา/ชื่อแอดมินย้อนหลังเอง
9. แหล่งใดโหลดไม่ได้ แสดงชื่อแหล่งที่ขาดและเวลาข้อมูลล่าสุด ไม่สรุปว่า “ครบทุกแหล่ง” และไม่ให้ส่งมอบบรรทัดที่ตรวจสถานะล่าสุดไม่ได้

## คอลเลกชันใหม่ที่เสนอ (ยังไม่ได้สร้าง)

### `customer_handover_events/{eventId}`: สมุดประวัติเพิ่มอย่างเดียว

หนึ่งเอกสารต่อเหตุการณ์/ใบรับ มีหลาย lines ได้ และ commit ทั้งใบแบบ atomic; จำกัดจำนวน lines ต่อใบให้ต่ำกว่า Firestore transaction/document limits

| ฟิลด์ | ความหมาย |
| --- | --- |
| `schemaVersion`, `eventId`, `requestId`, `requestHash` | เวอร์ชันและ idempotency; ID เดิมพร้อมเนื้อหาเดิมคืนผลเดิม เนื้อหาต่างปฏิเสธ |
| `type` | `opening_balance`, `handover`, `return`, `cancel_entitlement`, `reversal` |
| `customerPhoneNormalized`, `customerUid?`, `customerSnapshot` | ผู้ซื้อ; ชื่อ/codename ที่จำเป็นเท่านั้น ไม่ใช้ uid แทนโทร; สมาชิกแสดง avatar + codename ผ่าน identity layer |
| `recipient` | ผู้รับจริง: `self`/`representative`, ชื่อผู้รับและวิธียืนยันกับออเดอร์ กรณีรับแทน; ไม่บังคับเก็บภาพบัตรประชาชน |
| `branchId`, `branchNameSnapshot` | สาขาส่งมอบ เลือกจากรายการสาขาที่อนุญาต ไม่ยึด senafest เสมอ |
| `actorId`, `actorStaffCode`, `actorNameSnapshot` | ผู้ทำรายการจาก session จริงบน server; ไม่รับชื่อแอดมินจาก client |
| `recordedAt`, `effectiveAt?`, `businessDate` | เวลาบันทึก serverTimestamp (UTC), เวลารับจริงถ้าระบุย้อนหลังพร้อมเหตุผล; แสดง/จัดวัน Asia/Bangkok; ไม่ปลอมย้อนหลังเป็น recordedAt |
| `lines[]` | sourceKey, sourceCollection/path หรือ sheet reference, canonicalOrderId, lineKey, productId, componentId, productNameSnapshot, unit, quantity, sourceVersion/fingerprint และหลักฐานสถานะเงิน ณ บันทึก |
| `references[]`, `reason`, `evidencePaths[]` | อ้าง event/line/quantity เดิม เหตุผล หลักฐานใน Storage เป็น path ไม่ใส่ภาพ base64 ใน Firestore |
| `returnDisposition?` | `replace` = เปิดสิทธิ์รับใหม่ หรือ `close` = คืนปิดเรื่อง (ประกอบ cancel entitlement); ไม่ดำเนินการคืนเงินอัตโนมัติ |
| `openingEvidence?` | จำนวนสิทธิ์/เคยรับ/ยกเลิก/ส่งอยู่ ณ จุดเริ่ม, snapshotHash, แหล่งหลักฐาน, ผู้รับรอง, เวลารับรอง; ไม่ระบุแอดมินผู้ส่งของเดิมหากไม่มีข้อมูล |

ห้าม update/delete events รวมถึงแก้สะกด หากลงผิดสร้าง reversal อ้างรายการเดิมแล้วลงรายการใหม่; reversal กลับเฉพาะ quantity ที่ยังไม่ถูกกลับ ไม่สร้างวงจรย้อนอ้างอิง ให้แก้ reversal ที่ผิดด้วยเหตุการณ์ชดเชยใหม่ที่ตรวจ invariants เช่นเดียวกัน

### คอลเลกชันช่วยอ่านและกันชนกัน (ไม่ใช่ประวัติ)

- `customer_fulfillment_sources/{sourceKey}`: registry/mapping ต้นทางและเวอร์ชัน component, fingerprint, locator; ไม่ย้ายหรือลบต้นทาง
- `customer_fulfillment_balances/{sourceKey}/lines/{lineKey}`: projection จำนวนสิทธิ์/ยกเลิก/ส่งมอบสุทธิ/ส่งระหว่างทาง, version, lastEventId ใช้ transaction ต่อบรรทัด ปรับปรุงได้เพื่อคำนวณเร็ว แต่สร้างใหม่ได้จาก opening + events ทุกครั้ง ไม่เป็นหลักฐานแทน events
- index สำหรับค้น normalized phone + วันที่, sourceKey, branchId + recordedAt และ reference event; index ของ sources ตาม phone/status; paginate ประวัติและผลค้น ไม่อ่านทั้ง users/ทั้งออเดอร์จาก browser
- ป้องกัน retry ด้วย eventId ผูก requestId และ hash ใน transaction เดียว ไม่ใช้ UI disable อย่างเดียว; อ่าน balances ทุกบรรทัดก่อนเขียน event และ balances พร้อมกัน สองแอดมินรับชิ้นสุดท้ายพร้อมกันต้องสำเร็จคนเดียว
- Sheet/ออเดอร์ที่ระบบอื่นแก้ไม่อาจล็อกพร้อม Firestore แบบ atomic ได้: ใช้ source snapshot ที่รับรองเป็นสิทธิ์ เปิดอ่านอย่างเดียวช่วงกระทบยอด; เมื่อ fingerprint เปลี่ยนพักบรรทัดแล้วสร้างเหตุการณ์ปรับสิทธิ์ที่ผู้มีสิทธิ์รับรองก่อนปลดล็อก ห้ามแอบแทนยอดเดิม การเปิดจริงต้องกำหนดช่องทางเดียวสำหรับบันทึกส่งมอบและปิด/เชื่อม writer เก่า มิฉะนั้นไม่รับรองป้องกันส่งซ้ำข้ามระบบ

## ความหมายรับบางส่วน คืน และยกเลิก

- สั่ง Box 3 รับครั้งแรก 1: handover qty 1 เหลือ 2; ครั้งสองรับ 2 เหลือ 0 ทั้งสองเหตุการณ์ยังอยู่
- Bundle รับ Deck ก่อน: ลดเฉพาะ component Deck, Box ยังอยู่ในค้างรับ ไม่ตัดทั้ง bundle
- คืนเพื่อเปลี่ยน 1: return อ้าง handover เดิม qty 1 แบบ replace เปิดสิทธิ์อีก 1; การเปลี่ยนเป็นสินค้าอื่นต้องคืนของเดิมแล้วเพิ่มสิทธิ์ใหม่ที่อนุมัติ ไม่เปลี่ยน productId ในเหตุการณ์เก่า
- คืนปิดเรื่อง: return แบบ close และ cancel_entitlement ที่สัมพันธ์กันใน transaction เดียว ทำให้สินค้าที่คืนไม่กลับมาค้างรับ; เรื่องเงินส่งไปกระบวนการอนุมัติแยก
- ยกเลิกก่อนรับ: cancel_entitlement ได้ไม่เกินยอดค้าง; ยกเลิกของที่รับไปแล้วต้องมี return ก่อน ห้ามยกเลิกเพื่อทำประวัติส่งมอบหาย
- ลงรับผิดออเดอร์: reversal อ้าง original line แล้ว handover ใหม่ ตรวจยอดผู้ซื้อทั้งสองรายใหม่ มีเหตุผลและสิทธิ์หัวหน้า; ห้ามคืน/ย้อนจำนวนเกินยอดของ event ต้นทาง ห้ามอ้างสินค้าหรือลูกค้าคนละราย

## สิทธิ์และการรักษาประวัติ

เสนอสิทธิ์ `handover.read`, `handover.record`, `handover.correct`, `handover.approveOpening` แยกจากคำว่า admin ของ SOP (ปัจจุบันแปลว่าเจ้าของ ไม่ควรเปิดทั้งเว็บเพื่อให้แอดมินหน้าร้านใช้) ให้แชมป์กำหนดผู้มีสิทธิ์ในช่วงเปิดใช้งาน; สาขาที่ทำรายการต้องอยู่ในสิทธิ์ของผู้ใช้

API ทุกตัวตรวจ session จริง, allow-list/permission, branch, CSRF/origin และห้าม view-as เขียน; **ปิดการทำงานกับข้อมูลจริงถ้าไม่มี SESSION_SECRET/credentials** เพราะ requireUser ปัจจุบันมี preview-admin fallback ป้องกันทั้งอ่านและเขียน ไม่ใช้เพียง canWriteNow ซึ่งตรวจแค่ impersonation

browser ห้ามอ่าน collections ใหม่/ต้นทางโดยตรง; server อ่านข้อมูลเฉพาะจำเป็น ตัด slip/address ที่ไม่เกี่ยวออก, ไม่ log เบอร์เต็ม, ปกปิดเบอร์ในรายการประวัติรวม; ตรวจ role ฝั่ง server ทุกคำขอ ไม่พึ่งเมนูซ่อน

เสนอ Firestore rules ปฏิเสธ client write/update/delete ทั้งหมด และ server writer เป็นเส้นทางเดียวที่ใช้ create-only สำหรับ events ตรวจ diff/ทดสอบว่าไม่มี update/delete ประวัติ Admin SDK ข้าม rules ได้ จึงต้องจำกัด service account/IAM และไม่มี endpoint ลบ/แก้; ไม่อ้างว่า append-only ป้องกัน project owner ลบผ่าน console ได้อย่างสมบูรณ์ หากต้องการระดับกฎหมายให้แยกงานออกแบบ export หลักฐานไปที่เก็บ retention-locked และขออนุมัติต่างหาก

## หน้าจอที่เสนอ

หน้าทำงาน Operate บนมือถือ 390px: หัว “ส่งมอบสินค้า” พร้อมกลับหน้าหลักและเลือกสาขา → ช่องเบอร์โทรใหญ่ → ชื่อลูกค้า/สมาชิก avatar + codename → สรุป “พร้อมรับ / รับบางส่วน / รอของ / ต้องตรวจสอบ / ส่งพัสดุแล้ว” → รายการแยกออเดอร์และต้นทาง → สรุปก่อนบันทึก → ใบรับและยอดค้างล่าสุด

- แต่ละรายการแสดงสินค้า, หน่วย, สั่ง/เคยรับ/ค้าง, เลขออเดอร์, สถานะเงิน, component ของ bundle, วันข้อมูลล่าสุด มี checkbox เลือกและปรับจำนวน 1 ถึงค้าง ไม่เลือกทุกชิ้นให้อัตโนมัติ; รับจากหลายออเดอร์ในใบเดียวได้แต่ผูกที่มาทุก line
- ใช้แถวโปร่งคั่นเส้นบางตาม SOP ไม่มีกรอบซ้อน; Mitr, Lucide `Search`, `PackageCheck`, `History`, `RotateCcw`, `MapPin` ไม่มี emoji ใช้ design tokens ปัจจุบัน ไม่ hardcode สีส้ม
- ปุ่มสรุปด้านล่าง “ตรวจรายการ 3 ชิ้น” มีพื้นที่กันทับเนื้อหา/คีย์บอร์ด; หน้า review เต็มหน้าแทน modal แคบ แสดงผู้รับจริง สาขา รายการและจำนวน แล้ว “บันทึกส่งมอบ”; ต้องยืนยันตัวลูกค้ากับออเดอร์ก่อนส่งของ ไม่ถือการรู้เบอร์เป็นหลักฐานรับแทน
- loading/ไม่พบเบอร์/ไม่มียอดค้าง/ข้อมูลเก่า/ข้อมูลบางแหล่งขาด/สิทธิ์ไม่พอ/ส่งซ้ำ/ยอดเปลี่ยน/ออฟไลน์มีข้อความชัด ปิดบันทึกหากข้อมูลสำคัญไม่ครบ; เปลี่ยนเบอร์หรือสาขาให้ตรวจ selection อีกครั้ง
- draft เลือกสินค้า autosave localStorage แยกบัญชี/เบอร์/สาขา เก็บเฉพาะ keys/จำนวนที่จำเป็น ไม่เก็บสลิป/ชื่อเต็ม; reset ชัดเจน, restore ต้องโหลดสิทธิ์และยอดล่าสุดใหม่ก่อนบันทึก เปลี่ยนบัญชีห้ามโหลด draft ของคนอื่น; บันทึกสำเร็จเก็บ receipt และทำเครื่องหมาย draft ส่งแล้ว ไม่เปิดให้ retry เป็นใบใหม่
- ประวัติมีตัวกรองคน/วัน/สาขา/ออเดอร์, ลิงก์กลับต้นทางและ export เฉพาะผู้มีสิทธิ์; ปุ่ม “บันทึกคืน/ยกเลิก/แก้รายการ” สร้างเหตุการณ์ใหม่ มีเหตุผล ไม่มีปุ่มลบประวัติ
- desktop 1440px แบ่งรายการซ้าย/สรุปขวา; มือถือเป็นคอลัมน์เดียว ไม่มี horizontal scroll ปุ่มอย่างน้อย 44px input 16px ตัวอักษรยาวตัด … พร้อมเปิดดูเต็ม focus/label/สถานะอ่านด้วย screen reader ได้

## ขั้นตอนลงมือหลังอนุมัติและประมาณงาน

| ช่วง | ผลงานให้ตรวจ | เวลา |
| --- | --- | ---: |
| 1. รับรอง mapping | สำรวจบรรทัด/หน่วย/BOM ทุกแบบ, allocation L13 ทุกแท็บ, แถวทดสอบ/ซ้ำ, แผน snapshot และรายการต้องตรวจ | 1.5–2 วัน |
| 2. อ่านรวม | adapters + registry, normalize phone, API ค้นแบบ server-only, แสดงสถานะและที่มาครบ โดยยังไม่เปิดเขียน | 2–3 วัน |
| 3. สมุดส่งมอบ | events + projection + transactions/idempotency + รับบางส่วน/คืน/ยกเลิก/กลับรายการ + permissions | 2–3 วัน |
| 4. หน้าจอ | flow มือถือ, draft/review/receipt/history/export, error states, accessibility | 2–3 วัน |
| 5. ตรวจรับ | emulator/integration, กระทบยอด, screenshots 390/1440, ตรวจ diff/security, คู่มือและแผนเปิดใช้ | 1.5–2 วัน |

ยอดรวม 9–13 วันทำงาน; การกระทบยอดที่ต้องให้ร้านยืนยันอาจเพิ่มเวลาปฏิทิน ไม่รวมการตัดสินใจ refund/ราคา/stock adjustment หรือ KPI

ก่อนเปิดจริง: เสนอรายงานยอดตั้งต้นต่อออเดอร์พร้อมที่มา ให้เจ้าของรับรอง จากนั้นนำเข้า opening events แบบ idempotent เป็นงานแยกที่ต้องอนุมัติการเขียนข้อมูล; เปิดอ่านตรวจเทียบก่อน เปิดเขียนนำร่องหนึ่งสาขา แล้วครบทุกสาขา การ deploy/rules/นำเข้าข้อมูล/เปลี่ยน writer เก่าหยุดรออนุมัติ ห้ามให้สองระบบส่งมอบซ้ำโดยไม่เชื่อมยอด

## เกณฑ์ตรวจรับ

- fixtures ไม่ใช้ PII จริง ครบหกระบบ/รูปแบบเก่า; เบอร์ 0/+66 ต้องเจอออเดอร์เดียวกัน; order/reservation/payment/delivery ไม่ซ้ำ; phone หายหรือชนต้องเห็นคำเตือน
- รับบางส่วน, หลายออเดอร์, bundle ต่างล็อต, หน่วยและของแถม, ดิจิทัลไม่เป็นของค้างรับ; ชำระบางส่วน/รอตรวจ/สินค้ายกเลิกไม่เปิดรับผิด
- สองแอดมินพร้อมกัน, retry หลัง timeout, double tap, เปลี่ยนเนื้อหาใต้ requestId เดิม, stale source, source outage ต้องไม่รับเกิน/ซ้ำ และไม่มีเหตุการณ์ครึ่งใบ
- คืน/ยกเลิก/กลับรายการเกินจำนวนหรืออ้างคนละ line ต้องถูกปฏิเสธ; replay events ได้ยอดตรง projection และไม่มี update/delete events
- คนไม่มีสิทธิ์/preview/view-as/สาขาอื่นเข้าข้อมูลหรือปลอม actor ไม่ได้; client เขียน Firestore โดยตรงไม่ได้; ไม่มีสลิป base64 หรือ undefined fields
- ทดสอบ UI จริงที่ 390px/1440px เปิดภาพดู, keyboard/screen reader, reload draft และ primary button ไม่ทับรายการ; `npm run lint`, `npm test`, `npm run build` และ self-review ผ่านก่อนเสนอ deploy

## สิ่งที่ยังต้องอนุมัติ

อนุมัติแนวทางเพิ่มหน้าและคอลเลกชันตามแผนนี้ก่อนเริ่มพัฒนา; การนำเข้าประวัติเก่าและยอดตั้งต้น รายชื่อผู้มีสิทธิ์ และการเปิดใช้งานจริงเป็นจุดตรวจอนุมัติแยก ไม่เดาว่ายอดเก่าทั้งหมดเป็นค้างรับ การคืน/ยกเลิกในสมุดนี้ไม่มีผลคืนเงินเอง

**รออนุมัติจากแชมป์**
