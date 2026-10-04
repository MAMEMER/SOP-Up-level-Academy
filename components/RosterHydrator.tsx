"use client";

import { employeeDirectory, replaceEmployeeDirectory, type EmployeeDirectoryEntry } from "../lib/employee-directory.ts";

/**
 * ส่งรายชื่อพนักงานจริง (จาก /admin/staff ใน Firestore) ลงมาที่ browser ครั้งเดียวต่อหน้า.
 * เดิมฝั่ง browser มีแค่รายชื่อตั้งต้นในโค้ด → displayNameFor("UP-007") คืนรหัสแทนชื่อ
 * ทุกหน้าที่เป็น client component. วางไว้บนสุดของ AppShell ให้ทำงานก่อนส่วนอื่นๆ เรนเดอร์.
 * ไม่ส่งอีเมล — browser ใช้แค่รหัส↔ชื่อ/สาขา.
 */
export function RosterHydrator({ entries }: { entries: Omit<EmployeeDirectoryEntry, "email">[] }) {
  const same =
    entries.length === employeeDirectory.length &&
    entries.every((entry, index) => employeeDirectory[index]?.code === entry.code && employeeDirectory[index]?.displayName === entry.displayName);
  if (!same && typeof window !== "undefined") replaceEmployeeDirectory(entries);
  return null;
}
