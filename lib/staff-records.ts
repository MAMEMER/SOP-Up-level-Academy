import type { Role } from "./permissions.ts";
import { seedSopUsers } from "./sop-users.ts";
import { seedEmployeeDirectory, type EmploymentType } from "./employee-directory.ts";

// Pure staff-record shape + normalisation, kept out of staff-store.ts so it can be
// unit-tested without pulling in "server-only" and the Firestore admin SDK.

export type StaffRecord = {
  /** lowercased — this is the document id */
  email: string;
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

/** The compiled-in lists expressed as staff records — used to seed an empty collection. */
export function seedStaffRecords(): StaffRecord[] {
  const rosterByEmail = new Map(
    seedEmployeeDirectory.filter((entry) => entry.email).map((entry) => [normalizeEmail(entry.email!), entry])
  );

  return seedSopUsers.map((user) => {
    const roster = rosterByEmail.get(normalizeEmail(user.email));
    return {
      email: normalizeEmail(user.email),
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
  const onRoster = input.onRoster !== false;
  const code = String(input.code || "").trim();
  return {
    email,
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
