// ย้ายรายการ checklist ประจำสัปดาห์ / ประจำเดือน ของเดิม เข้าระบบ "สั่งงาน" ใหม่
// (lib/work-spec.ts) เพื่อให้ทุกงานถูกแก้ที่เดียวและตั้งได้ครบเหมือนกัน — รวมถึงงานที่เคยสั่งไป
// แล้ว ก็มาตั้ง "ส่งงานแบบไหน" (ติ๊ก / พิมพ์ / ตัวเลข / รูป / ลิงก์ / ตัวเลือก) ได้ทีหลัง
//
// กติกา: **กดซ้ำได้ไม่ซ้ำงาน** — งานที่มี id เดิมอยู่แล้วจะไม่ถูกเขียนทับ (ของที่เจ้าของแก้ไป
// หลังย้ายจึงไม่ถูกย้อน) และงานเดิมในระบบเก่าไม่ถูกลบ

import { resolvePhaseChecklistItems, type ChecklistScopeConfig, type OverrideItem } from "./checklist-overrides.ts";
import { baseItemsFor, sharedUnitIdFor, sharedUnitTitle, type PeriodicPeriod } from "./periodic-tasks.ts";
import type { ShiftCode } from "./shift-schedule.ts";
import { isHhMm, type WorkFrequency, type WorkSpec, type WorkTiming } from "./work-spec.ts";

/** "กะ 1" / "กะ2" / "ทุกกะ" → รหัสกะ (ไม่รู้จัก = ทุกกะ) */
export function shiftsFromLabel(label: string | undefined): ShiftCode[] {
  const text = (label || "").replace(/\s+/g, "");
  const out: ShiftCode[] = [];
  if (/กะ1|s1/i.test(text)) out.push("s1");
  if (/กะ2|s2/i.test(text)) out.push("s2");
  return out;
}

/**
 * ป้ายเวลาแบบข้อความของระบบเก่า ("ก่อน 12:00", "11:00-23:59") → เวลาเริ่ม/กำหนดส่งจริง
 * เท่าที่อ่านออก. อ่านไม่ออกก็ปล่อยว่าง แล้วข้อความเดิมไปอยู่ในรายละเอียดแทน — ดีกว่าเดา
 * เวลาผิดแล้วไปล็อกไม่ให้พนักงานกดส่ง
 */
export function timingFromLabel(label: string | undefined): WorkTiming {
  const text = (label || "").trim();
  if (!text) return {};
  const range = text.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  const pad = (value: string) => (value.length === 4 ? `0${value}` : value);
  if (range && isHhMm(pad(range[1])) && isHhMm(pad(range[2]))) {
    return { openTime: pad(range[1]), dueTime: pad(range[2]) };
  }
  const single = text.match(/(?:ก่อน|ภายใน|ไม่เกิน)\s*(\d{1,2}:\d{2})/);
  if (single && isHhMm(pad(single[1]))) return { dueTime: pad(single[1]) };
  return {};
}

function itemToSpec(input: {
  item: OverrideItem;
  frequency: WorkFrequency;
  category: string;
  unitTimeLabel?: string;
  unitShiftLabel?: string;
  order: number;
}): WorkSpec {
  const { item, frequency, category, unitTimeLabel, unitShiftLabel, order } = input;
  // เวลา/กะ ของรายการเองมาก่อน ถ้าไม่มีค่อยใช้ของหัวข้อ
  const timing = { ...timingFromLabel(unitTimeLabel), ...timingFromLabel(item.timeLabel) };
  const shifts = shiftsFromLabel(item.shiftLabel || unitShiftLabel);
  // ป้ายเวลาที่อ่านเป็น HH:MM ไม่ได้ ยังมีค่ากับคนอ่าน — เก็บต่อท้ายรายละเอียดไว้
  const leftoverTime = [unitTimeLabel, item.timeLabel]
    .filter((label): label is string => Boolean(label && label.trim()))
    .filter((label) => !timingFromLabel(label).dueTime && !timingFromLabel(label).openTime);
  const detail = [item.note, ...leftoverTime].filter(Boolean).join(" · ");

  const spec: WorkSpec = {
    id: `${frequency}-${item.id}`,
    title: item.title,
    category,
    schedule: { frequency },
    owners: shifts.length ? { shifts } : {},
    timing,
    active: true,
    order
  };
  if (detail) spec.detail = detail;
  if (item.answer) spec.answer = item.answer;
  if (item.links?.length) spec.links = item.links;
  return spec;
}

/** รายการของช่วงเวลาหนึ่ง (สัปดาห์/เดือน) ที่ควรถูกย้ายเข้าระบบใหม่ */
export function specsFromPeriod(period: PeriodicPeriod, config: ChecklistScopeConfig, startOrder = 0): WorkSpec[] {
  const frequency: WorkFrequency = period === "weekly" ? "weekly" : "monthly";
  const sharedId = sharedUnitIdFor(period);
  const out: WorkSpec[] = [];

  const unitIds = [sharedId, ...config.customUnits.map((unit) => unit.id)];
  for (const unitId of unitIds) {
    if (config.hidden.includes(unitId)) continue;
    const override = config.overrides[unitId];
    const custom = config.customUnits.find((unit) => unit.id === unitId);
    const baseItems = unitId === sharedId ? baseItemsFor(period) : [];
    const items = resolvePhaseChecklistItems(baseItems, override);
    const category = override?.title || custom?.title || sharedUnitTitle(period);
    for (const item of items) {
      if (!item.title.trim()) continue;
      out.push(
        itemToSpec({
          item,
          frequency,
          category,
          unitTimeLabel: override?.timeLabel,
          unitShiftLabel: override?.shiftLabel,
          order: startOrder + out.length
        })
      );
    }
  }
  return out;
}

/**
 * รวมงานที่ย้ายมาเข้ากับงานที่มีอยู่ — **ไม่ทับของเดิม**. คืนลิสต์ใหม่ + จำนวนที่เพิ่มจริง
 * เพื่อบอกเจ้าของได้ว่าย้ายมากี่งาน (กดซ้ำแล้วได้ 0 = ย้ายครบแล้ว)
 */
export function mergeImportedSpecs(existing: WorkSpec[], incoming: WorkSpec[]): { tasks: WorkSpec[]; added: number } {
  const taken = new Set(existing.map((spec) => spec.id));
  const fresh = incoming.filter((spec) => !taken.has(spec.id));
  const tasks = [...existing, ...fresh].map((spec, order) => ({ ...spec, order }));
  return { tasks, added: fresh.length };
}
