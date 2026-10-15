/** GB soft-removal: only boolean true hides a record; old/restored docs stay visible. */
export type RemovalFields = {
  removed?: unknown;
  removedBy?: string;
  removedAt?: string;
  removedReason?: string;
};
export function isRemoved(record: RemovalFields): boolean { return record.removed === true; }
export function visibleRecords<T extends RemovalFields>(records: readonly T[], showRemoved = false): T[] {
  return records.filter((record) => showRemoved || !isRemoved(record));
}
/** Copy audit fields only, never the source document's customer/slip data. */
export function removalFields(record: RemovalFields): RemovalFields {
  return isRemoved(record) ? {
    removed: true,
    removedBy: record.removedBy || "ไม่ระบุ",
    removedAt: record.removedAt || "",
    removedReason: record.removedReason || "ไม่ระบุเหตุผล"
  } : {};
}
