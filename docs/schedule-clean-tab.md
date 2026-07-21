# ตารางกะแบบสะอาด (KPI Schedule) — tab ใหม่

เหตุผล: tab เดิม (JUN26/JUL26) เป็น month-grid ที่ parse สดไม่ได้ — แถวเลขวันที่พิมพ์ผิด
(วันที่ 10 เป็น "11" ทำ column เลื่อนทั้งแถว), shift code กำกวม (11/13 มี legend แต่ 15/23 ไม่มี),
ชื่อ tab มีจุด/เว้นวรรค gviz resolve ไม่ได้. จึงทำ **tab ใหม่** ที่สะอาด (ไม่ลบของเดิม)
แล้วให้เว็บอ่านสดจาก tab นี้แทน hardcode.

## โครง tab ใหม่ — ชื่อ tab: `KPI`

หนึ่งแถว = หนึ่งกะ. 4 คอลัมน์ header (แถว 1):

| A: วันที่ | B: รหัสพนักงาน | C: เข้ากะ | D: สถานะ |
|---|---|---|---|
| 2026-08-01 | ICE | 11:00 | ทำงาน |
| 2026-08-01 | Boom | 13:30 | ทำงาน |
| 2026-08-02 | Leo | 09:00 | ทำงาน |
| 2026-08-03 | Boom | OFF | ลาป่วย |

กติกา parser:
- **วันที่** = `YYYY-MM-DD` เท่านั้น
- **รหัสพนักงาน** = ICE / Boom / Leo (alias StoreHub เช่น "UP ICE" ก็ map ให้)
- **เข้ากะ** = `HH:MM` (เช่น 11:00, 09:00, 13:30) หรือ `OFF` (วันหยุด = ข้าม ไม่หักคะแนน)
- **สถานะ** = `ทำงาน` / `ลาป่วย` / `ลากิจ` (ลา → นับ leave ไม่หักเข้างาน)

## Data validation (dropdown) — กันพิมพ์มั่ว
- B (รหัสพนักงาน): List = `ICE,Boom,Leo`
- C (เข้ากะ): List = `09:00,11:00,13:00,13:30,15:00,OFF`
- D (สถานะ): List = `ทำงาน,ลาป่วย,ลากิจ`

## LIVE ในชีตแล้ว — 2 tab (grid → flat อัตโนมัติ)
คนจัดตารางกรอกใน tab **`วางแผน`** (grid คน×วัน, dropdown 8 ค่า: 09:00/11:00/13:00/13:30/15:00/OFF/ป่วย/กิจ),
tab **`KPI`** (flat ที่ app อ่าน) สร้างเองด้วย formula ใน `KPI!A2`:

```
=ARRAYFORMULA(LET(g, วางแผน!B3:AF5, dts, วางแผน!B2:AF2, emp, วางแผน!A3:A5, nR, ROWS(g), nC, COLUMNS(g), idx, SEQUENCE(nR*nC,1,0), ri, INT(idx/nC)+1, ci, MOD(idx,nC)+1, v, FLATTEN(g), e, CHOOSEROWS(emp, ri), d, CHOOSEROWS(TRANSPOSE(dts), ci), keep, (v<>"")*(v<>"OFF"), IFERROR(FILTER({TEXT(d,"yyyy-mm-dd"), e, IF((v="ป่วย")+(v="กิจ"),"OFF",IF(ISNUMBER(v),TEXT(v,"HH:MM"),v)), IFS(v="ป่วย","ลาป่วย",v="กิจ","ลากิจ",TRUE,"ทำงาน")}, keep),"")))
```

grid: `วางแผน!B1` = วันแรกของเดือน · `B2:AF2` = วันที่ (auto +1) · `A3:A5` = ICE/Boom/Leo · `B3:AF5` = ค่ากะ (dropdown).
กติกาแปลง: OFF → ตัดออก · ป่วย/กิจ → เข้ากะ OFF + สถานะ ลาป่วย/ลากิจ · เวลา → ทำงาน. แก้ grid → KPI อัปเดตทันที.

## วิธีเปิดใช้ในเว็บ (หลัง tab พร้อม)
ตั้ง env `SCHEDULE_SHEET_CSV_URL` = 
`https://docs.google.com/spreadsheets/d/1C9iMNfU8PYGoAaUN68M39ihJSOW4ZcYinzYDHBgyDWw/gviz/tq?tqx=out:csv&sheet=KPI`
(sheet ต้องเปิด "ใครมีลิงก์ดูได้"). เว็บจะอ่านสด — ถ้าอ่านไม่ได้ fallback เป็น fixture เดิม.

Reader + parser: `lib/schedule-sheet.ts` (มี unit test `tests/schedule-sheet.test.ts`).
