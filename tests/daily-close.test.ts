import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankDayWindow,
  calendarDayWindow,
  closeProblems,
  computeCash,
  reconcileKshop,
  satangBucket,
  satangRuleIssues,
  summarizePos,
  type PosTransaction
} from "../lib/daily-close.ts";

const BK = "store-bangkae";
const tx = (over: Partial<PosTransaction>): PosTransaction => ({
  refId: Math.random().toString(36).slice(2),
  invoiceNumber: "001",
  storeId: BK,
  transactionType: "Sale",
  transactionTime: "2026-10-02T05:00:00Z",
  total: 100,
  payments: [{ paymentMethod: "K-Shop", amount: 100 }],
  ...over
});

test("เศษสตางค์บอกว่าเป็นเงินของใคร", () => {
  assert.equal(satangBucket(450), "whole");
  assert.equal(satangBucket(6399.99), "store");
  assert.equal(satangBucket(1349.8), "store");
  assert.equal(satangBucket(220.11), "online");
  assert.equal(satangBucket(219.79), "online");
});

test("วันธนาคารตัด 23:00 — บิล 23:30 ไปอยู่วันถัดไป", () => {
  const day2 = bankDayWindow("2026-10-02");
  assert.equal(new Date(day2.from).toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(new Date(day2.to).toISOString(), "2026-10-02T16:00:00.000Z");
  const cal = calendarDayWindow("2026-10-02");
  assert.equal(new Date(cal.from).toISOString(), "2026-10-01T17:00:00.000Z");
});

test("สรุป POS: แยกวิธีจ่าย ไม่นับบิลยกเลิก บิลคืนเป็นลบ", () => {
  const rows = [
    tx({ payments: [{ paymentMethod: "K-Shop", amount: 450 }] }),
    tx({ payments: [{ paymentMethod: "Cash", amount: 120 }] }),
    tx({ payments: [{ paymentMethod: "Cash", amount: 50 }], transactionType: "Return" }),
    tx({ payments: [{ paymentMethod: "K-Shop", amount: 999 }], isCancelled: true }),
    tx({ payments: [{ paymentMethod: "K-Shop", amount: 220.11 }] }),
    tx({ storeId: "other", payments: [{ paymentMethod: "Cash", amount: 9999 }] })
  ];
  const s = summarizePos(rows, BK, calendarDayWindow("2026-10-02"));
  assert.equal(s.bills, 4);
  assert.equal(s.cancelledBills, 1);
  assert.equal(s.cash, 70);
  assert.equal(s.kshop.total, 670.11);
  assert.equal(s.kshop.whole, 450);
  assert.equal(s.kshop.online, 220.11);
});

test("บิลผิดเครื่องถูกจับได้", () => {
  const s = summarizePos(
    [tx({ payments: [{ paymentMethod: "K-Shop", amount: 300 }] }), tx({ payments: [{ paymentMethod: "K-Shop", amount: 99.99 }] })],
    BK,
    calendarDayWindow("2026-10-02")
  );
  assert.equal(satangRuleIssues("bangkae", s.kshop.bills).length, 1);
  assert.equal(satangRuleIssues("senafest", s.kshop.bills).length, 1); // 300 เต็มบาทไม่ใช่ของเสนาฯ
});

test("เงินสด: ควรมี = ทอนตั้งต้น + ขายสด − จ่ายออก · ไม่ตรงต้องมีหมายเหตุ", () => {
  const input = { openingFloat: 1000, counts: { "500": 2, "100": 3, "20": 1 }, paidOuts: [{ amount: 40, note: "น้ำแข็ง" }], floatKept: 1000 };
  const cash = computeCash(input, 360);
  assert.equal(cash.counted, 1320);
  assert.equal(cash.expected, 1320);
  assert.equal(cash.diff, 0);
  assert.equal(cash.handover, 320);
  assert.deepEqual(closeProblems(input, cash, ""), []);

  const short = computeCash({ ...input, counts: { "500": 2, "100": 3 } }, 360);
  assert.equal(short.diff, -20);
  assert.equal(closeProblems(input, short, "").length, 1);
  assert.deepEqual(closeProblems(input, short, "ทอนเกินลูกค้า 20"), []);
  assert.equal(closeProblems({ ...input, paidOuts: [{ amount: 40, note: " " }] }, cash, "").length, 1);
});

test("รวมสองสาขาเทียบยอดธนาคาร + หาเงินเข้าที่ไม่มีบิล", () => {
  const bill = (amount: number) => ({ refId: String(amount), invoiceNumber: "", time: "12:00", date: "2026-10-02", amount, bucket: satangBucket(amount) });
  const r = reconcileKshop(
    { bangkae: [bill(450), bill(450)], senafest: [bill(6399.99), bill(220.11)] },
    [{ amount: 450, at: "" }, { amount: 6399.99, at: "" }, { amount: 75.5, at: "" }],
    7520.1
  );
  assert.equal(r.posTotal, 7520.1);
  assert.equal(r.diff, 0);
  assert.deepEqual(r.byBucket, { whole: 900, store: 6399.99, online: 220.11 });
  assert.deepEqual(r.moneyInWithoutBill.map((m) => m.amount), [75.5]);
  assert.deepEqual(r.billsWithoutMoneyIn.map((b) => b.amount).sort(), [220.11, 450]);
});
