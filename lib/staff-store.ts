import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { replaceSopUsers, type SopUser } from "./sop-users.ts";
import { replaceEmployeeDirectory, type EmployeeDirectoryEntry } from "./employee-directory.ts";
import { nextEmployeeId, normalizeEmail, sanitizeStaffRecord, seedStaffRecords, type StaffRecord } from "./staff-records.ts";

export { normalizeEmail, seedStaffRecords, type StaffRecord } from "./staff-records.ts";

// Staff are managed from /admin/staff instead of by editing code + deploying.
//
// One Firestore document per person merges the two lists the app used to hardcode:
//   sop-users.ts        — who may sign in, and with what role
//   employee-directory.ts — the KPI / shift roster (code, aliases, employment type)
//
// The compiled-in lists stay as the seed and as the offline fallback, so a Firestore
// outage degrades to exactly the behaviour we had before rather than locking everyone out.

export const STAFF_COLLECTION = "sop_staff";

const LOCAL_STORE = join(process.cwd(), ".data", "staff.json");
const runningOnVercel = Boolean(process.env.VERCEL);
const CACHE_TTL_MS = 30_000;

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalStore(): Promise<StaffRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(LOCAL_STORE, "utf8"));
    return Array.isArray(parsed) ? parsed.map((row) => sanitizeStaffRecord(row)) : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: StaffRecord[]) {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(records, null, 2), "utf8");
}

async function readStored(): Promise<StaffRecord[]> {
  const mode = storageMode();
  if (mode === "firestore") {
    const snapshot = await adminDb().collection(STAFF_COLLECTION).get();
    return snapshot.docs.map((doc) => sanitizeStaffRecord({ ...(doc.data() as StaffRecord), email: doc.id }));
  }
  if (mode === "local-file") return readLocalStore();
  return [];
}

let cache: { records: StaffRecord[]; loadedAt: number } | null = null;

/** Drops the cache so the next read reflects a just-saved change. */
export function invalidateStaffCache() {
  cache = null;
}

/**
 * Every staff record, falling back to the compiled-in seed when the collection is
 * empty or storage is unavailable. Cached briefly — this runs on every request.
 */
export async function listStaff(): Promise<StaffRecord[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.records;

  let records: StaffRecord[] = [];
  try {
    records = await readStored();
  } catch {
    records = [];
  }
  if (!records.length) records = seedStaffRecords();

  records.sort((left, right) => {
    if (left.role !== right.role) return left.role === "admin" ? -1 : 1;
    return left.name.localeCompare(right.name, "th");
  });
  cache = { records, loadedAt: Date.now() };
  return records;
}

function toSopUser(record: StaffRecord): SopUser {
  return { email: record.email, name: record.name, role: record.role, departmentId: record.departmentId };
}

function toDirectoryEntry(record: StaffRecord): EmployeeDirectoryEntry {
  return {
    code: record.code,
    displayName: record.displayName,
    email: record.email,
    employmentType: record.employmentType,
    // always match on the code itself so a roster entry can never resolve to nothing
    aliases: [...new Set([record.code.toLowerCase(), ...record.aliases])].filter(Boolean),
    branch: record.branch
  };
}

/**
 * Hydrates the sign-in allow-list and the shift roster from storage.
 *
 * Called from requireUser() (which the dashboard layout and every API route run first),
 * so the ~50 synchronous `sopUsers` / `employeeDirectory` readers downstream always see
 * the managed list without each of them having to become async.
 */
export async function ensureStaffLoaded(): Promise<StaffRecord[]> {
  const records = await listStaff();
  const active = records.filter((record) => record.active);
  replaceSopUsers(active.map(toSopUser));
  replaceEmployeeDirectory(active.filter((record) => record.onRoster && record.code).map(toDirectoryEntry));
  return records;
}

export async function saveStaff(input: Partial<StaffRecord> & { email: string }): Promise<StaffRecord> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("staff_storage_unavailable");

  const stored = await readStored();
  const record = sanitizeStaffRecord({
    ...input,
    // assign a staff number on first save, and keep whatever this person already has
    employeeId:
      input.employeeId ||
      stored.find((row) => row.email === normalizeEmail(input.email))?.employeeId ||
      nextEmployeeId(stored)
  });
  if (!record.email.includes("@")) throw new Error("invalid_email");

  if (mode === "firestore") {
    await adminDb().collection(STAFF_COLLECTION).doc(record.email).set(record);
  } else {
    const stored = (await readLocalStore()).length ? await readLocalStore() : seedStaffRecords();
    const next = stored.filter((row) => row.email !== record.email);
    next.push(record);
    await writeLocalStore(next);
  }

  invalidateStaffCache();
  await ensureStaffLoaded();
  return record;
}

export async function removeStaff(email: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("staff_storage_unavailable");

  const target = normalizeEmail(email);
  if (mode === "firestore") {
    await adminDb().collection(STAFF_COLLECTION).doc(target).delete();
  } else {
    const stored = (await readLocalStore()).length ? await readLocalStore() : seedStaffRecords();
    await writeLocalStore(stored.filter((row) => row.email !== target));
  }

  invalidateStaffCache();
  await ensureStaffLoaded();
}

/**
 * Issues a staff number to anyone still without one.
 *
 * Runs when /admin/staff is opened rather than from a script, because the service-account
 * credentials only exist on the server. Numbers go out in roster order, so the founding
 * team keeps the low ones, and an existing number is never changed.
 */
export async function ensureEmployeeIds(): Promise<number> {
  if (storageMode() === "unavailable") return 0;

  const stored = await readStored();
  const pending = stored.filter((record) => !record.employeeId);
  if (!pending.length) return 0;

  const seedOrder = seedStaffRecords().map((record) => record.email);
  const rank = (email: string) => {
    const index = seedOrder.indexOf(email);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const issued = stored.filter((record) => record.employeeId);
  for (const record of [...pending].sort((left, right) => rank(left.email) - rank(right.email) || left.email.localeCompare(right.email))) {
    const employeeId = nextEmployeeId(issued);
    await saveStaff({ ...record, employeeId });
    issued.push({ ...record, employeeId });
  }
  return pending.length;
}

/**
 * Writes the compiled-in list into storage once, so the first visit to /admin/staff
 * has real editable documents instead of a read-only view of the seed.
 */
export async function seedStaffIfEmpty(): Promise<boolean> {
  if (storageMode() === "unavailable") return false;
  if ((await readStored()).length) return false;
  for (const record of seedStaffRecords()) await saveStaff(record);
  return true;
}
