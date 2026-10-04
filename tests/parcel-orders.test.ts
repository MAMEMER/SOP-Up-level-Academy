import test from "node:test";
import assert from "node:assert/strict";
import {
  arrivalDueDate,
  normaliseItems,
  ownerAlertMessage,
  parcelLateAdjustments,
  parcelState,
  parcelsNeedingOwnerAlert,
  processDueDate,
  type ParcelOrder
} from "../lib/parcel-orders.ts";

function order(patch: Partial<ParcelOrder> = {}): ParcelOrder {
  return {
    id: "o1",
    branch: "bangkae",
    seller: "ร้าน A",
    orderedDate: "2026-10-04",
    dueDate: arrivalDueDate("2026-10-04"),
    sellerPhotos: [],
    items: [{ id: "i1", name: "Pikachu ex", qty: 1, plan: "sell", price: 500 }],
    createdBy: "champ",
    createdAt: "2026-10-04T03:00:00.000Z",
    ...patch
  };
}

test("ต้องถึงร้านภายใน 5 วันหลังสั่ง", () => {
  assert.equal(arrivalDueDate("2026-10-04"), "2026-10-09");
  assert.equal(arrivalDueDate("2026-10-30"), "2026-11-04");
});

test("ยังไม่ถึงร้าน: waiting ถึงวันครบกำหนด แล้วเป็น overdue วันถัดไป", () => {
  assert.equal(parcelState(order(), "2026-10-09"), "waiting");
  assert.equal(parcelState(order(), "2026-10-10"), "overdue");
});

test("ถึงแล้ว: ทำให้จบภายในวันที่ถึง + 1 วัน ไม่งั้นเป็น late", () => {
  const arrived = order({ arrivedDate: "2026-10-06" });
  assert.equal(processDueDate("2026-10-06"), "2026-10-07");
  assert.equal(parcelState(arrived, "2026-10-07"), "arrived");
  assert.equal(parcelState(arrived, "2026-10-08"), "late");
});

test("ทำครบแล้วมีปัญหาค้าง = problem · ปิดเรื่องแล้ว = done · ยกเลิก = cancelled", () => {
  const base = { arrivedDate: "2026-10-06", processedDate: "2026-10-06" };
  assert.equal(parcelState(order({ ...base, problems: [{ note: "ขาด", by: "ICE", at: "x" }] }), "2026-10-20"), "problem");
  assert.equal(
    parcelState(order({ ...base, problems: [{ note: "ขาด", by: "ICE", at: "x", resolvedAt: "y" }] }), "2026-10-20"),
    "done"
  );
  assert.equal(parcelState(order({ cancelled: true }), "2026-10-20"), "cancelled");
});

test("KPI: หักคนที่เข้ากะสาขาปลายทางจริง เฉพาะวันที่เลยกำหนด", () => {
  // ถึง 6 → ต้องจบภายใน 7 → วันที่ 8, 9 เลย · วันนี้ 10 (ยังไม่จบ ไม่นับ)
  const worked = new Set([
    "ICE:2026-10-07:bangkae", // อยู่ในกำหนด ไม่หัก
    "ICE:2026-10-08:bangkae",
    "Boom:2026-10-08:senafest", // คนละสาขา ไม่หัก
    "Leo:2026-10-09:bangkae",
    "Leo:2026-10-10:bangkae" // วันนี้ ไม่หัก
  ]);
  const adj = parcelLateAdjustments([order({ arrivedDate: "2026-10-06" })], {
    today: "2026-10-10",
    ratePerDay: 2,
    workedAtBranch: worked,
    startFrom: "2026-10-01"
  });
  assert.deepEqual(
    adj.map((a) => `${a.employeeName}:${a.workDate}:${a.points}`).sort(),
    ["ICE:2026-10-08:-2", "Leo:2026-10-09:-2"]
  );
  assert.ok(adj.every((a) => a.category === "assigned_work" && a.recordedBy === "auto"));
});

test("KPI: ทำจบวันไหน วันนั้นไม่นับว่าเลย · ยังไม่ถึง/ยกเลิก/อัตรา 0 = ไม่หัก", () => {
  const worked = new Set(["ICE:2026-10-08:bangkae", "ICE:2026-10-09:bangkae"]);
  const opts = { today: "2026-10-12", ratePerDay: 2, workedAtBranch: worked, startFrom: "2026-10-01" };
  const doneOn9 = order({ arrivedDate: "2026-10-06", processedDate: "2026-10-09" });
  assert.deepEqual(parcelLateAdjustments([doneOn9], opts).map((a) => a.workDate), ["2026-10-08"]);
  assert.equal(parcelLateAdjustments([order()], opts).length, 0);
  assert.equal(parcelLateAdjustments([order({ arrivedDate: "2026-10-06", cancelled: true })], opts).length, 0);
  assert.equal(parcelLateAdjustments([order({ arrivedDate: "2026-10-06" })], { ...opts, ratePerDay: 0 }).length, 0);
});

test("KPI: ไม่หักย้อนก่อนวันเปิดระบบ", () => {
  const worked = new Set(["ICE:2026-10-02:bangkae", "ICE:2026-10-05:bangkae"]);
  const adj = parcelLateAdjustments([order({ orderedDate: "2026-09-25", arrivedDate: "2026-09-28" })], {
    today: "2026-10-06",
    ratePerDay: 2,
    workedAtBranch: worked,
    startFrom: "2026-10-04"
  });
  assert.deepEqual(adj.map((a) => a.workDate), ["2026-10-05"]);
});

test("เตือนแชมป์วันละครั้งต่อออเดอร์ เฉพาะ overdue/late/problem", () => {
  const overdue = order({ id: "a" });
  const alerted = order({ id: "b", ownerAlertedOn: "2026-10-12" });
  const waiting = order({ id: "c", orderedDate: "2026-10-11", dueDate: arrivalDueDate("2026-10-11") });
  const due = parcelsNeedingOwnerAlert([overdue, alerted, waiting], "2026-10-12");
  assert.deepEqual(due.map((o) => o.id), ["a"]);
  const message = ownerAlertMessage(due, "2026-10-12");
  assert.match(message, /เกิน 5 วัน/);
  assert.match(message, /เกิน 3 วัน/);
  assert.doesNotMatch(message, /[[\]*_]/);
});

test("รายการลงแฟ้มขายต้องมีราคา · เก็บไว้ก่อนไม่ต้อง · แถวว่างถูกข้าม", () => {
  let n = 0;
  const id = () => `x${n++}`;
  assert.match(normaliseItems([{ name: "A", plan: "sell" }], id).error ?? "", /ต้องใส่ราคา/);
  const ok = normaliseItems([{ name: "A", plan: "sell", price: "1,200" }, { name: "" }, { name: "B", plan: "keep", price: 99 }], id);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.items.map((i) => [i.name, i.plan, i.price]), [["A", "sell", 1200], ["B", "keep", undefined]]);
  assert.ok(normaliseItems([], id).error);
});
