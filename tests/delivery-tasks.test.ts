import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addWorkDays,
  bangkokWorkDate,
  buildShiftWindows,
  deliveryStatusText,
  deliveryTargetLabel,
  deliveryTargetsFor,
  deliveryTaskState,
  deliveryTaskVisibleTo,
  isOwnShiftTask,
  minutesOfDay,
  nextDayTargetsFor,
  parseShiftTarget,
  shiftTargetKey,
  sortDeliveryTasks,
  summariseOrderLines,
  type DeliveryTask,
  type ShiftWindows
} from "../lib/delivery-tasks.ts";

// เวลาไทย → Date. ทุกเคสด้านล่างคิดเป็นเวลาหน้าร้าน (Asia/Bangkok) ไม่ใช่ UTC
const bkk = (isoLocal: string) => new Date(`${isoLocal}+07:00`);

const TODAY = "2026-08-10";
const TOMORROW = "2026-08-11";

// ตารางกะมาตรฐาน: กะ 1 เข้า 09:00 เลิก 18:00 · กะ 2 เข้า 13:00 เลิก 22:00
const windows: ShiftWindows = {
  today: buildShiftWindows(TODAY, [
    { staffCode: "E01", shift: "s1", startTime: "09:00" },
    { staffCode: "E02", shift: "s2", startTime: "13:00" }
  ]),
  tomorrow: buildShiftWindows(TOMORROW, [
    { staffCode: "E03", shift: "s1", startTime: "09:00" },
    { staffCode: "E04", shift: "s2", startTime: "13:00" }
  ])
};

function task(overrides: Partial<DeliveryTask> = {}): DeliveryTask {
  return {
    id: "dt__order1",
    branch: "bangkae",
    orderId: "order1",
    orderCode: "ORDER1",
    source: "web",
    customerName: "ลูกค้า ก",
    customerPhone: "0800000000",
    customerAddress: "123 ถนนเพชรเกษม",
    customerNote: "",
    itemsSummary: "Booster Box ×1",
    itemCount: 1,
    total: 3990,
    paidAt: bkk(`${TODAY}T10:00:00`).toISOString(),
    paidWorkDate: TODAY,
    dueDate: TOMORROW,
    detectedAt: bkk(`${TODAY}T10:01:00`).toISOString(),
    targets: [shiftTargetKey(TODAY, "s1")],
    status: "open",
    ...overrides
  };
}

describe("minutesOfDay / parseShiftTarget", () => {
  it("parses a valid HH:MM", () => {
    assert.equal(minutesOfDay("09:00"), 540);
    assert.equal(minutesOfDay("15:00"), 900);
  });

  it("rejects junk rather than guessing", () => {
    assert.equal(minutesOfDay("9am"), null);
    assert.equal(minutesOfDay("24:70"), null);
    assert.equal(parseShiftTarget("2026-08-10:s9"), null);
    assert.equal(parseShiftTarget("nonsense"), null);
  });

  it("round-trips a target key", () => {
    assert.deepEqual(parseShiftTarget(shiftTargetKey(TODAY, "s2")), { workDate: TODAY, shift: "s2" });
  });
});

describe("addWorkDays", () => {
  it("moves the Bangkok calendar day, including across a month end", () => {
    assert.equal(addWorkDays("2026-08-10", 1), "2026-08-11");
    assert.equal(addWorkDays("2026-08-31", 1), "2026-09-01");
    assert.equal(addWorkDays("2026-08-01", -1), "2026-07-31");
  });
});

describe("buildShiftWindows", () => {
  it("spans from the earliest entry to the latest finish of that shift", () => {
    const built = buildShiftWindows(TODAY, [
      { staffCode: "E01", shift: "s1", startTime: "11:00" },
      { staffCode: "E05", shift: "s1", startTime: "09:00" }
    ]);
    assert.equal(built.length, 1);
    assert.equal(built[0].start, "09:00");
    assert.equal(built[0].end, "20:00");
    assert.deepEqual(built[0].staffCodes.sort(), ["E01", "E05"]);
  });

  it("falls back to the default entry time when the cell has none", () => {
    const built = buildShiftWindows(TODAY, [{ staffCode: "E02", shift: "s2" }]);
    assert.equal(built[0].start, "11:30");
    assert.equal(built[0].end, "20:30");
  });

  it("skips a shift nobody is rostered on", () => {
    const built = buildShiftWindows(TODAY, [{ staffCode: "E01", shift: "s1", startTime: "09:00" }]);
    assert.deepEqual(built.map((window) => window.shift), ["s1"]);
  });
});

describe("deliveryTargetsFor — ทีมวันนี้ / ทีมพรุ่งนี้", () => {
  const bothToday = [shiftTargetKey(TODAY, "s1"), shiftTargetKey(TODAY, "s2")];
  const bothTomorrow = [shiftTargetKey(TOMORROW, "s1"), shiftTargetKey(TOMORROW, "s2")];

  it("จ่ายก่อน 15:00 → ขึ้นทั้งสองกะของวันนี้ ไม่ลามไปพรุ่งนี้", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T10:00:00`), windows), bothToday);
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T14:59:00`), windows), bothToday);
  });

  it("กะ 2 ยังไม่เข้างานก็ยังเห็น — ไม่ต้องรอถึงเวลาเข้ากะ", () => {
    assert.ok(deliveryTargetsFor(bkk(`${TODAY}T10:00:00`), windows).includes(shiftTargetKey(TODAY, "s2")));
  });

  it("จ่ายตั้งแต่ 15:00 → ทีมวันนี้ + ทีมพรุ่งนี้", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T15:00:00`), windows), [...bothToday, ...bothTomorrow]);
  });

  it("จ่ายตอนร้านปิดแล้ว → ทีมพรุ่งนี้อย่างเดียว", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T23:30:00`), windows), bothTomorrow);
  });

  it("จ่ายเช้ามืดก่อนร้านเปิด → ยังเป็นของทีมวันนี้", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T05:00:00`), windows), bothToday);
  });

  it("วันนี้ไม่มีใครลงกะ → ตกไปทีมพรุ่งนี้", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T10:00:00`), { today: [], tomorrow: windows.tomorrow }), bothTomorrow);
  });

  it("ไม่มีตารางกะเลยทั้งสองวัน → ไม่มี target (จะไปโผล่ให้ทุกคนเห็นแทน)", () => {
    assert.deepEqual(deliveryTargetsFor(bkk(`${TODAY}T16:00:00`), { today: [], tomorrow: [] }), []);
  });
});

describe("nextDayTargetsFor — ปุ่มส่งงานให้พรุ่งนี้", () => {
  it("ส่งต่อให้ทีมที่มาวันถัดไป ทั้งสองกะ", () => {
    assert.deepEqual(nextDayTargetsFor(windows, TOMORROW), [
      shiftTargetKey(TOMORROW, "s1"),
      shiftTargetKey(TOMORROW, "s2")
    ]);
  });

  it("พรุ่งนี้ยังไม่ได้ลงตารางกะ ก็ยังส่งต่อได้ ไม่ตีกลับ", () => {
    assert.deepEqual(nextDayTargetsFor({ today: windows.today, tomorrow: [] }, TOMORROW), [
      shiftTargetKey(TOMORROW, "s1"),
      shiftTargetKey(TOMORROW, "s2")
    ]);
  });
});

describe("deliveryTaskVisibleTo", () => {
  const admin = { isAdmin: true, staffCode: "E09", shiftToday: null, today: TODAY };
  const opener = { isAdmin: false, staffCode: "E01", shiftToday: "s1" as const, today: TODAY };
  const closer = { isAdmin: false, staffCode: "E02", shiftToday: "s2" as const, today: TODAY };
  const dayOff = { isAdmin: false, staffCode: "E07", shiftToday: null, today: TODAY };

  it("เจ้าของร้านเห็นทุกใบ แม้ไม่ได้ลงกะ", () => {
    assert.equal(deliveryTaskVisibleTo(task(), admin), true);
  });

  it("คนที่เข้ากะวันนี้เห็นออเดอร์ที่ยังไม่ส่งทุกใบ แม้ไม่ใช่ของกะตัวเอง (หยิบแทนกันได้)", () => {
    assert.equal(deliveryTaskVisibleTo(task(), opener), true);
    assert.equal(deliveryTaskVisibleTo(task(), closer), true);
  });

  it("แต่ยังแยกออกว่าใบไหนเป็นงานของกะใคร", () => {
    assert.equal(isOwnShiftTask(task(), opener), true);
    assert.equal(isOwnShiftTask(task(), closer), false);
    assert.equal(isOwnShiftTask(task(), dayOff), false);
  });

  it("ใบที่ target ทั้งสองกะ ทั้งคู่เห็น", () => {
    const both = task({ targets: [shiftTargetKey(TODAY, "s1"), shiftTargetKey(TODAY, "s2")] });
    assert.equal(deliveryTaskVisibleTo(both, opener), true);
    assert.equal(deliveryTaskVisibleTo(both, closer), true);
  });

  it("คนที่รับงานไว้ยังเห็นแม้กะจะเปลี่ยนไปแล้ว", () => {
    const claimed = task({ targets: [shiftTargetKey(TOMORROW, "s1")], claimedBy: "E01", status: "packing" });
    assert.equal(deliveryTaskVisibleTo(claimed, opener), true);
  });

  it("วันหยุดไม่เห็นงานส่งของ", () => {
    assert.equal(deliveryTaskVisibleTo(task(), dayOff), false);
  });

  it("ใบค้างจากเมื่อวานที่ยังไม่ส่ง ทุกคนที่เข้ากะวันนี้เห็น — ห้ามหายเงียบ", () => {
    const stale = task({ targets: [shiftTargetKey("2026-08-09", "s2")], dueDate: TODAY });
    assert.equal(deliveryTaskVisibleTo(stale, opener), true);
    assert.equal(deliveryTaskVisibleTo(stale, closer), true);
    assert.equal(deliveryTaskVisibleTo(stale, dayOff), false);
  });

  it("ยังไม่ได้ลงตารางกะ → ทุกคนที่ล็อกอินเห็น ห้ามให้ออเดอร์หายไปเงียบ", () => {
    const unrostered = task({ targets: [] });
    assert.equal(deliveryTaskVisibleTo(unrostered, opener), true);
    assert.equal(deliveryTaskVisibleTo(unrostered, dayOff), true);
  });

  it("ใบเก่าที่ส่งไปแล้ว ไม่กลับมารกหน้ากะอื่น", () => {
    const shipped = task({
      targets: [shiftTargetKey("2026-08-09", "s2")],
      status: "shipped",
      trackingNumber: "TH123"
    });
    assert.equal(deliveryTaskVisibleTo(shipped, opener), false);
  });
});

describe("deliveryTaskState / deliveryStatusText", () => {
  it("ยังไม่ถึงกำหนดและ target วันนี้ = ต้องทำวันนี้", () => {
    assert.equal(deliveryTaskState(task(), TODAY), "due");
  });

  it("เลย dueDate = เลยกำหนด", () => {
    assert.equal(deliveryTaskState(task({ dueDate: "2026-08-09" }), TODAY), "overdue");
    assert.match(deliveryStatusText(task({ dueDate: "2026-08-09" }), TODAY), /เลยกำหนดส่ง/);
  });

  it("target เฉพาะพรุ่งนี้ = ยังไม่ถึงคิว", () => {
    assert.equal(deliveryTaskState(task({ targets: [shiftTargetKey(TOMORROW, "s1")] }), TODAY), "upcoming");
  });

  it("ส่งแล้วถือว่าเสร็จ และโชว์เลข tracking", () => {
    const shipped = task({ status: "shipped", trackingNumber: "TH0001" });
    assert.equal(deliveryTaskState(shipped, TODAY), "done");
    assert.equal(deliveryStatusText(shipped, TODAY), "ส่งแล้ว · TH0001");
  });

  it("บอกได้ว่าใบนี้รับต่อมาจากเมื่อวาน", () => {
    assert.match(deliveryStatusText(task({ handedOff: true }), TODAY), /รับต่อจากเมื่อวาน/);
  });
});

describe("deliveryTargetLabel / sortDeliveryTasks", () => {
  it("อ่านออกว่าเป็นของกะไหนบ้าง", () => {
    const both = task({ targets: [shiftTargetKey(TODAY, "s2"), shiftTargetKey(TOMORROW, "s1")] });
    assert.equal(deliveryTargetLabel(both), `${TODAY} กะ 2 · ${TOMORROW} กะ 1`);
  });

  it("เลยกำหนดขึ้นก่อน แล้วค่อยเรียงตามกำหนดส่ง ส่วนที่ส่งแล้วไปท้ายสุด", () => {
    const late = task({ id: "late", dueDate: "2026-08-09" });
    const soon = task({ id: "soon", dueDate: TOMORROW });
    const later = task({ id: "later", dueDate: "2026-08-12", targets: [shiftTargetKey("2026-08-12", "s1")] });
    const shipped = task({ id: "shipped", status: "shipped", dueDate: "2026-08-09" });
    const sorted = sortDeliveryTasks([shipped, later, soon, late], TODAY);
    assert.deepEqual(sorted.map((item) => item.id), ["late", "soon", "later", "shipped"]);
  });
});

describe("summariseOrderLines", () => {
  // ออเดอร์ shield จริง (2026-08-10): ชื่อสินค้ามีจำนวนอยู่ในตัวแล้ว และแถม 1 ทุก 10
  const shieldLine = { sku: "SHIELD", name: "Up Level Shield ×10 (+1 ฟรี = 11 ชิ้น)", qty: 10, pieces: 11 };

  it("นับตามจำนวนชิ้นจริงที่ต้องหยิบใส่กล่อง ไม่ใช่จำนวนที่ลูกค้ากดสั่ง", () => {
    assert.equal(summariseOrderLines([shieldLine]).count, 11);
  });

  it("ไม่ต่อ ×10 ซ้ำเมื่อชื่อสินค้ามีอยู่แล้ว", () => {
    assert.equal(summariseOrderLines([shieldLine]).summary, "Up Level Shield ×10 (+1 ฟรี = 11 ชิ้น)");
  });

  it("ยังต่อจำนวนให้สินค้าทั่วไปที่ชื่อไม่มีจำนวน", () => {
    assert.equal(summariseOrderLines([{ name: "Booster Box", qty: 3 }]).summary, "Booster Box ×3");
    assert.equal(summariseOrderLines([{ name: "Booster Box", qty: 1 }]).summary, "Booster Box");
  });

  it("ไม่มี pieces ก็นับจาก qty", () => {
    assert.equal(summariseOrderLines([{ name: "Sleeve", qty: 2 }, { name: "Deck Box", qty: 1 }]).count, 3);
  });

  it("ย่อรายการยาวแทนที่จะพ่นทั้งหมด", () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ name: `สินค้า ${index + 1}`, qty: 1 }));
    assert.match(summariseOrderLines(many).summary, /…อีก 2 รายการ$/);
  });

  it("ออเดอร์ที่ไม่มี items ตกไปใช้ชื่อสินค้ากับจำนวนชิ้นรวม", () => {
    assert.deepEqual(summariseOrderLines([], { product: "up-level-shield", pieces: 11 }), {
      summary: "up-level-shield",
      count: 11
    });
  });
});

describe("bangkokWorkDate", () => {
  it("ยังเป็นวันเดิมตอนตีหนึ่งบ้านเรา แม้ UTC จะยังเป็นเมื่อวาน", () => {
    assert.equal(bangkokWorkDate(bkk(`${TODAY}T01:00:00`)), TODAY);
  });

  it("ข้ามวันตอนเที่ยงคืนไทย ไม่ใช่เที่ยงคืน UTC", () => {
    assert.equal(bangkokWorkDate(bkk(`${TODAY}T23:59:00`)), TODAY);
    assert.equal(bangkokWorkDate(bkk(`${TOMORROW}T00:01:00`)), TOMORROW);
  });
});
