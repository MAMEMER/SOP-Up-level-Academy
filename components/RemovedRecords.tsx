"use client";
import { isRemoved, type RemovalFields } from "../lib/removed-records.ts";
export function RemovedToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="removed-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />แสดงรายการที่เอาชื่อออก</label>;
}
export function RemovalNote({ record }: { record: RemovalFields }) {
  if (!isRemoved(record)) return null;
  return <p className="removed-note">เอาชื่อออกโดย {record.removedBy || "ไม่ระบุ"} · เวลา {record.removedAt || "ไม่ระบุ"} · เหตุผล: {record.removedReason || "ไม่ระบุเหตุผล"}</p>;
}
