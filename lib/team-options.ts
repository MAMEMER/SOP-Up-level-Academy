// Team quick-select options for the "ผู้รับผิดชอบ" picker on /admin/assign
// (suggestion ticket AvYge3vV6w39OUfEHwIE — "เพิ่มตัวเลือก team": add Team Bangkae
// and Team Sena fest to the responsible-person choices).
//
// A team is just a named shortcut that ticks a whole group of staff at once. The
// assignment still fans out to one work_assignments doc per person
// (AssignWork.submit loops selectedCodes), so no store/dashboard change is needed —
// each member still sees the task on their own "วันนี้ของฉัน". Membership is derived
// live from the roster branch so a rename/onboard can't leave a team pointing at a
// stale code.

import type { EmployeeDirectoryEntry } from "./employee-directory.ts";

export type TeamOption = {
  key: string;
  /** label = exactly what the ticket asked to see in the picker */
  label: string;
  memberCodes: string[];
};

// branch = which roster branch feeds this team's members. Onboard a staff member on
// the "senafest" branch (via /admin/staff) and the Sena fest team fills automatically.
const TEAM_DEFS: { key: string; label: string; branch: string }[] = [
  { key: "bangkae", label: "Team Bangkae", branch: "bangkae" },
  { key: "senafest", label: "Team Sena fest", branch: "senafest" }
];

export function buildTeamOptions(roster: Pick<EmployeeDirectoryEntry, "code" | "branch">[]): TeamOption[] {
  return TEAM_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    memberCodes: roster.filter((entry) => entry.branch === def.branch).map((entry) => entry.code)
  }));
}

// Toggle a team's members in/out of the current selection: if every member is already
// selected, remove them (untick the team); otherwise add the missing ones. Preserves
// any individually-picked staff outside the team.
export function toggleTeamSelection(selected: string[], memberCodes: string[]): string[] {
  if (memberCodes.length === 0) return selected;
  const set = new Set(selected);
  const allOn = memberCodes.every((code) => set.has(code));
  if (allOn) {
    memberCodes.forEach((code) => set.delete(code));
  } else {
    memberCodes.forEach((code) => set.add(code));
  }
  return [...set];
}

export function isTeamSelected(selected: string[], memberCodes: string[]): boolean {
  return memberCodes.length > 0 && memberCodes.every((code) => selected.includes(code));
}
