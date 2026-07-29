import type { Role } from "./permissions.ts";
import { seedSopUsers } from "./sop-users.ts";
import { seedEmployeeDirectory, type EmploymentType } from "./employee-directory.ts";

// Pure staff-record shape + normalisation, kept out of staff-store.ts so it can be
// unit-tested without pulling in "server-only" and the Firestore admin SDK.

export type StaffRecord = {
  /** lowercased — this is the document id */
  email: string;
  /**
   * Human-readable staff number for paperwork and for referring to someone outside the
   * app (UP-001, UP-002, …). Assigned once and never reused, so it stays a stable
   * reference even if the person's name or code changes. Distinct from `code`, which is
   * the internal key the schedule, KPI and work records join on.
   */
  employeeId: string;
  /** name shown in the app shell */
  name: string;
  role: Role;
  departmentId: string | null;
  /** true when this person is on the shift roster (admins-only accounts are false) */
  onRoster: boolean;
  /** canonical short code used by KPI, the planner and work records */
  code: string;
  /** name as it appears in the schedule sheet */
  displayName: string;
  employmentType: EmploymentType;
  branch: string;
  /** lowercased substrings that identify this person in StoreHub exports */
  aliases: string[];
  /** false = keeps history but can no longer sign in and is off the roster */
  active: boolean;
};

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export const EMPLOYEE_ID_PREFIX = "UP";

/**
 * The next unused staff number. Numbers are never recycled — a departed employee keeps
 * theirs so old paperwork still resolves to the right person.
 */
export function nextEmployeeId(existing: Array<{ employeeId?: string }>): string {
  const used = existing
    .map((record) => Number(String(record.employeeId || "").replace(`${EMPLOYEE_ID_PREFIX}-`, "")))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${EMPLOYEE_ID_PREFIX}-${String(next).padStart(3, "0")}`;
}

/** The compiled-in lists expressed as staff records — used to seed an empty collection. */
export function seedStaffRecords(): StaffRecord[] {
  const rosterByEmail = new Map(
    seedEmployeeDirectory.filter((entry) => entry.email).map((entry) => [normalizeEmail(entry.email!), entry])
  );

  return seedSopUsers.map((user) => {
    const roster = rosterByEmail.get(normalizeEmail(user.email));
    return {
      email: normalizeEmail(user.email),
      employeeId: "",
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
      onRoster: Boolean(roster),
      code: roster?.code || "",
      displayName: roster?.displayName || user.name,
      employmentType: roster?.employmentType || "part_time",
      branch: roster?.branch || "bangkae",
      aliases: roster ? [...roster.aliases] : [],
      active: true
    };
  });
}

export function sanitizeStaffRecord(input: Partial<StaffRecord> & { email: string }): StaffRecord {
  const email = normalizeEmail(input.email);
  const role: Role = input.role === "admin" || input.role === "leader" ? input.role : "employee";
  const employeeId = String(input.employeeId || "").trim().toUpperCase();
  const onRoster = input.onRoster !== false;
  const code = String(input.code || "").trim();
  return {
    email,
    employeeId,
    name: String(input.name || "").trim() || email,
    role,
    departmentId: input.departmentId ?? (role === "admin" ? "admin" : "front-store"),
    onRoster: onRoster && Boolean(code),
    code,
    displayName: String(input.displayName || "").trim() || code || String(input.name || "").trim(),
    employmentType: input.employmentType === "full_time" ? "full_time" : "part_time",
    branch: String(input.branch || "").trim() || "bangkae",
    aliases: (input.aliases || [])
      .map((alias) => String(alias || "").trim().toLowerCase())
      .filter(Boolean),
    active: input.active !== false
  };
}

/** shortest alias that is still specific enough to identify one person in StoreHub */
const MIN_AUTO_ALIAS_LENGTH = 3;

/**
 * StoreHub names are matched by substring, so the code is added as a fallback alias only
 * when it is long enough to be distinctive. A one- or two-character code (staff "P") would
 * otherwise match nearly every name on the timesheet and claim other people's clock-ins.
 * Short codes rely on the explicit StoreHub names entered at /admin/staff.
 */
export function storeHubAliases(record: StaffRecord): string[] {
  const explicit = record.aliases.filter(Boolean);
  const code = record.code.toLowerCase();
  const useCode = code.length >= MIN_AUTO_ALIAS_LENGTH || explicit.length === 0;
  return [...new Set(useCode ? [code, ...explicit] : explicit)].filter(Boolean);
}
