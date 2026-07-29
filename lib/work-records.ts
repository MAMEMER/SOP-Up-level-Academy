// Shared, pure helpers for the server-persisted work records (routine checklists).
//
// Before this, every checklist lived in the browser's localStorage AND was hard-disabled
// (`workflowRecordingEnabled = false`), so staff ticks never left the device and nothing
// reached review / KPI. Records now live in Firestore `sop_work_records`, written through
// the server (admin SDK) so the employee identity comes from the session cookie and can't
// be spoofed from the client.
//
// One document per (employee, scope window):
//   docId = `${employeeKey}__${scopeKey}`   e.g. `ICE__d-2026-07-29`
// The docId prefix makes "this person's last N days" a plain documentId range query — no
// composite index to deploy. `scopeKey` is also a field so admin views can read "everyone
// on this day" with a single-field equality query.

export type WorkRecordScope = "daily" | "weekly" | "monthly";

export const WORK_RECORDS_COLLECTION = "sop_work_records";

export type WorkRecordDoc = {
  employeeKey: string;
  employeeEmail: string;
  employeeName: string;
  branch: string;
  scope: WorkRecordScope;
  scopeKey: string;
  /** Free-form per-scope payload (checked items, notes, detail fields, phase records). */
  data: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string;
};

const scopePrefix: Record<WorkRecordScope, string> = { daily: "d", weekly: "w", monthly: "m" };

/**
 * Who a record belongs to. Daily routine is per person (it feeds that person's KPI);
 * weekly / monthly stock counts are a shared branch task the team finishes together, so
 * they live under one team key instead of fragmenting across whoever happened to tick.
 */
export type WorkRecordOwner = "me" | "team";

export function teamKeyForBranch(branch: string) {
  return `team-${branch}`;
}

/** Stable, filesystem-safe key for a person. Employee code when known, else an email slug. */
export function employeeKeyFromEmail(email: string | null | undefined, code?: string | null): string {
  if (code) return code;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function dailyScopeKey(workDate: string) {
  return `${scopePrefix.daily}-${workDate}`;
}

export function weeklyScopeKey(workWeek: string) {
  return `${scopePrefix.weekly}-${workWeek}`;
}

export function monthlyScopeKey(monthKey: string) {
  return `${scopePrefix.monthly}-${monthKey}`;
}

export function scopeKeyFor(scope: WorkRecordScope, windowKey: string) {
  return `${scopePrefix[scope]}-${windowKey}`;
}

/** Strips the scope prefix back off (`d-2026-07-29` → `2026-07-29`). */
export function windowKeyFromScopeKey(scopeKey: string) {
  const dash = scopeKey.indexOf("-");
  return dash === -1 ? scopeKey : scopeKey.slice(dash + 1);
}

export function workRecordDocId(employeeKey: string, scopeKey: string) {
  return `${employeeKey}__${scopeKey}`;
}

/** Inclusive documentId bounds for "this employee, scopeKeys between from and to". */
export function workRecordIdRange(employeeKey: string, fromScopeKey: string, toScopeKey: string) {
  return {
    start: workRecordDocId(employeeKey, fromScopeKey),
    end: workRecordDocId(employeeKey, toScopeKey)
  };
}

/** ISO date (Bangkok) N days before `workDate`. */
export function shiftWorkDate(workDate: string, days: number) {
  const date = new Date(`${workDate}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isValidScope(value: unknown): value is WorkRecordScope {
  return value === "daily" || value === "weekly" || value === "monthly";
}

/** Guards against a runaway payload being written into a single document. */
export const MAX_WORK_RECORD_BYTES = 200_000;
