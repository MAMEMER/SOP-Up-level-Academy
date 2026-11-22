// Owner เข้าสาขา — each owner marks, per day, which branch they will be at. Shown as a coloured
// dot per person on the บอร์ดทีม calendar. One doc per (date, member) in mp_presence.

export const PRESENCE_MEMBERS = ["champ", "name", "muk"] as const;
export type PresenceMember = (typeof PRESENCE_MEMBERS)[number];

export const PRESENCE_BRANCHES = [
  { key: "bangkae", name: "บางแค", short: "บค" },
  { key: "senafest", name: "เสนาเฟสท์", short: "สฟ" }
] as const;
export type PresenceBranch = (typeof PRESENCE_BRANCHES)[number]["key"];

export type OwnerPresence = {
  id: string;
  date: string; // YYYY-MM-DD
  member: PresenceMember;
  branch: PresenceBranch;
  updatedAt: string;
};

export const isPresenceMember = (v: unknown): v is PresenceMember =>
  typeof v === "string" && (PRESENCE_MEMBERS as readonly string[]).includes(v);

export const isPresenceBranch = (v: unknown): v is PresenceBranch =>
  typeof v === "string" && PRESENCE_BRANCHES.some((b) => b.key === v);

export const presenceId = (date: string, member: string) => `${date}_${member}`;

export const branchLabel = (b: string) => PRESENCE_BRANCHES.find((x) => x.key === b)?.name ?? b;

/** branch "" = ไม่เข้าร้านวันนั้น (clears the mark). */
export function validatePresence(input: unknown): { ok: true; date: string; branch: PresenceBranch | "" } | { ok: false; error: string } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  const branch = typeof raw.branch === "string" ? raw.branch.trim() : "";
  if (branch && !isPresenceBranch(branch)) return { ok: false, error: "ไม่รู้จักสาขานี้" };
  return { ok: true, date, branch: branch as PresenceBranch | "" };
}

/** date → marks in PRESENCE_MEMBERS order (แชมป์ · เนม · มุก). */
export function presenceByDate(list: OwnerPresence[]): Map<string, OwnerPresence[]> {
  const map = new Map<string, OwnerPresence[]>();
  for (const p of list) {
    if (!isPresenceMember(p.member) || !isPresenceBranch(p.branch)) continue;
    map.set(p.date, [...(map.get(p.date) ?? []), p]);
  }
  for (const marks of map.values()) marks.sort((a, b) => PRESENCE_MEMBERS.indexOf(a.member) - PRESENCE_MEMBERS.indexOf(b.member));
  return map;
}
