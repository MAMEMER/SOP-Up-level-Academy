// Pure helpers for the staff-facing "มุมมองพนักงาน" (self KPI view).
// Kept logic-only + tested so the access rules ("staff only see themselves",
// "owner defaults to self-view") can't silently regress.

import type { DeductionRecord } from "./performance-score.ts";

export type StaffViewSelection = {
  /** employee code to render, or null when there is nothing to show (empty state) */
  selectedCode: string | null;
  /** owner-only: whether the staff picker should be shown */
  canSwitch: boolean;
};

/**
 * Decides whose staff-view we render.
 *  - staff (non-owner): always their own code; a requested code is ignored so they can
 *    never peek at another person's score. null when the login email isn't in the
 *    directory → caller shows the Thai empty state.
 *  - owner (admin): may switch to any valid code via `requestedCode`; otherwise defaults
 *    to their own code (self-view first), else the first staff in the list.
 */
export function resolveStaffViewSelection(input: {
  isOwner: boolean;
  selfCode: string | null;
  requestedCode?: string | null;
  validCodes: string[];
}): StaffViewSelection {
  const { isOwner, selfCode, requestedCode, validCodes } = input;
  const isValid = (code: string | null | undefined): code is string => Boolean(code && validCodes.includes(code));

  if (!isOwner) {
    return { selectedCode: isValid(selfCode) ? selfCode : null, canSwitch: false };
  }

  const selected = isValid(requestedCode)
    ? requestedCode
    : isValid(selfCode)
      ? selfCode
      : validCodes[0] ?? null;
  return { selectedCode: selected, canSwitch: true };
}

const deductionCategoryLabels: Record<DeductionRecord["category"], string> = {
  attendance: "เข้างาน",
  stock: "Stock",
  checklist: "Checklist",
  customer_service: "บริการลูกค้า",
  assigned_work: "งานที่มอบหมาย"
};

export function deductionCategoryLabel(category: DeductionRecord["category"]): string {
  return deductionCategoryLabels[category] ?? category;
}

const sourceLabels: Record<string, string> = {
  "google-sheet": "ตารางกะ",
  storehub: "StoreHub",
  manual: "บันทึกมือ",
  import: "นำเข้า",
  live: "เรียลไทม์",
  mock: "ตัวอย่าง"
};

export function deductionSourceLabel(source: string): string {
  return sourceLabels[source] ?? source;
}
