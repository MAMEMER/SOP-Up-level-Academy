// สเตตัส Hard / Soft skill ของพนักงาน (กราฟเรดาร์ในหน้า performance-score) — pure ล้วน.
// อ่านอย่างเดียวจากระดับที่แอดมินยืนยันแล้วใน /admin/skill-review; ไม่แตะ KPI / เงินเดือน.

import { maxLevelFor, skillIndicators, type SkillGroup } from "./skill-indicators.ts";
import type { SkillLevelsRecord } from "./skill-reviews.ts";
import { SKILL_REVIEW_ENABLED } from "./feature-flags.ts";

export const skillLevelLabels: Array<{ level: number; label: string }> = [
  { level: 1, label: "ฝึกหัด" },
  { level: 2, label: "ทำเองได้" },
  { level: 3, label: "ชำนาญ" },
  { level: 4, label: "ออกแบบ / เป็นแบบอย่าง" }
];

/** ชื่อสั้นสำหรับป้ายบนกราฟ — ชื่อเต็มยาวเกินจะล้นขอบ */
const shortNames: Record<string, string> = {
  cashier: "คิดเงินและขาย",
  assigned_work: "งานมอบหมาย",
  cleanliness: "ความสะอาดร้าน",
  checklist: "ทำตาม Checklist",
  honesty: "ซื่อสัตย์"
};

export type SkillStatusItem = {
  id: string;
  name: string;
  shortName: string;
  level: number;
};

export type SkillStatusGroup = {
  group: SkillGroup;
  maxLevel: number;
  items: SkillStatusItem[];
  /** เฉลี่ยทศนิยม 1 ตำแหน่ง (ตัวที่ยังไม่ได้ประเมินนับเป็น 0) */
  average: number;
  rated: number;
};

export type SkillStatus = { hard: SkillStatusGroup; soft: SkillStatusGroup; hasData: boolean };

/**
 * สเตตัสที่แสดงในหน้าคะแนนพนักงาน — คืน undefined เมื่อระบบ skill ถูกปิดไว้ (SKILL_REVIEW_ENABLED)
 * หน้าคะแนนจึงไม่แสดงส่วนนี้เลยโดยไม่ต้องแก้หน้านั้น.
 */
export function buildSkillStatus(record: SkillLevelsRecord | undefined): SkillStatus | undefined {
  return SKILL_REVIEW_ENABLED ? computeSkillStatus(record) : undefined;
}

export function computeSkillStatus(record: SkillLevelsRecord | undefined): SkillStatus {
  const groupOf = (group: SkillGroup): SkillStatusGroup => {
    const indicators = skillIndicators.filter((indicator) => indicator.group === group);
    const items = indicators.map((indicator) => ({
      id: indicator.id,
      name: indicator.name,
      shortName: shortNames[indicator.id] || indicator.name,
      level: Math.max(0, Math.min(maxLevelFor(indicator), Math.round(record?.levels[indicator.id]?.level || 0)))
    }));
    const total = items.reduce((sum, item) => sum + item.level, 0);
    return {
      group,
      maxLevel: indicators.length ? maxLevelFor(indicators[0]) : 0,
      items,
      average: items.length ? Math.round((total / items.length) * 10) / 10 : 0,
      rated: items.filter((item) => item.level > 0).length
    };
  };
  const hard = groupOf("hard");
  const soft = groupOf("soft");
  return { hard, soft, hasData: hard.rated + soft.rated > 0 };
}

/** จุดบนแกนที่ `index` จาก `count` แกน (แกนแรกชี้ขึ้น หมุนตามเข็ม) */
export function radarPoint(index: number, count: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return {
    x: Math.round((cx + radius * Math.cos(angle)) * 10) / 10,
    y: Math.round((cy + radius * Math.sin(angle)) * 10) / 10
  };
}

export function radarPolygon(values: number[], maxValue: number, radius: number, cx: number, cy: number): string {
  return values
    .map((value, index) => {
      const point = radarPoint(index, values.length, (Math.max(0, Math.min(maxValue, value)) / maxValue) * radius, cx, cy);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}
