// Canonical employee directory — single source of truth for name matching across
// systems (schedule Google Sheet, StoreHub Timesheets, StoreHub Stocktakes, email).
// Hardening for KPI: replaces fragile substring guessing with an explicit, editable
// alias table so a rename in StoreHub can't silently drop someone's score.

export type EmploymentType = "full_time" | "part_time";

export type EmployeeDirectoryEntry = {
  /** canonical short code used everywhere in the app */
  code: string;
  /** display / schedule-sheet name */
  displayName: string;
  email?: string;
  employmentType: EmploymentType;
  /** lowercased substrings that identify this person in StoreHub exports */
  aliases: string[];
  /** home branch key (see store-config.ts) */
  branch: string;
};

export const employeeDirectory: EmployeeDirectoryEntry[] = [
  {
    code: "ICE",
    displayName: "ICE",
    email: "phooreephat.k@gmail.com",
    employmentType: "full_time",
    // "Ungkanawin Narawit" / "...Academy" are the manager-verifier rows StoreHub
    // attributes to the ICE account; keep mapping them to ICE to preserve behavior.
    aliases: ["ice", "up ice", "ungkanawin", "academy"],
    branch: "bangkae"
  },
  {
    code: "Boom",
    displayName: "Boom",
    email: "boomboom08755@gmail.com",
    employmentType: "full_time",
    aliases: ["boom", "boom dog"],
    branch: "bangkae"
  },
  {
    code: "Leo",
    displayName: "Leo",
    employmentType: "full_time",
    aliases: ["leo", "up leo"],
    branch: "bangkae"
  }
];

export const employeeCodes = employeeDirectory.map((entry) => entry.code);

export function resolveEmployeeCode(rawName: string): string {
  const normalized = rawName.trim().toLowerCase();
  if (!normalized) return rawName.trim();
  // Longest alias first so "boom dog" wins over "boom" when both would match.
  const match = employeeDirectory
    .flatMap((entry) => entry.aliases.map((alias) => ({ code: entry.code, alias })))
    .filter((candidate) => normalized.includes(candidate.alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0];
  return match ? match.code : rawName.trim();
}

export function employmentTypeFor(code: string): EmploymentType {
  return employeeDirectory.find((entry) => entry.code === code)?.employmentType ?? "full_time";
}

export function branchFor(code: string): string {
  return employeeDirectory.find((entry) => entry.code === code)?.branch ?? "bangkae";
}
