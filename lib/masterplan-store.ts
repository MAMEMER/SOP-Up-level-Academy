import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import {
  DEFAULT_DOC_TITLES,
  checkDocSize,
  formatCode,
  isDocSlug,
  type MpChangelog,
  type MpDoc,
  type MpMeeting,
  type MpProposal,
  type MpScratch,
  type MpTask
} from "./masterplan.ts";

// Storage for the Masterplan workspace (collections prefixed mp_). Server-side only:
// every read/write goes through /masterplan pages or /api/masterplan routes, which check
// requireMasterplanMember() first. Prod uses the Admin SDK (the shared Firestore rules
// default-deny mp_*, so the browser can never touch these directly).
//
// Same backend switch as work-records-store.ts:
//   Firestore (service account)  → prod
//   .data/masterplan.json        → local dev (no service-account env locally)
//   unavailable                  → on Vercel without credentials (a serverless disk is
//                                  wiped on cold start, so "saving" there would lose data)

export type MpCollection = "mp_docs" | "mp_scratch" | "mp_proposals" | "mp_tasks" | "mp_meetings" | "mp_changelog" | "mp_meta";

const LOCAL_STORE = join(process.cwd(), ".data", "masterplan.json");
const runningOnVercel = Boolean(process.env.VERCEL);

export function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

export class StoreConflictError extends Error {}
export class StoreUnavailableError extends Error {}

type LocalStore = Partial<Record<MpCollection, Record<string, unknown>>>;

async function readLocal(): Promise<LocalStore> {
  try {
    return JSON.parse(await readFile(LOCAL_STORE, "utf8")) as LocalStore;
  } catch {
    return {};
  }
}

async function writeLocal(store: LocalStore): Promise<void> {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  const tmp = `${LOCAL_STORE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, LOCAL_STORE);
}

// one writer at a time for the local file (read-modify-write)
let localQueue: Promise<unknown> = Promise.resolve();
function withLocalLock<T>(work: () => Promise<T>): Promise<T> {
  const run = localQueue.then(work, work);
  localQueue = run.catch(() => undefined);
  return run;
}

function assertAvailable() {
  if (storageMode() === "unavailable") throw new StoreUnavailableError("masterplan storage is not configured");
}

function assertId(id: string) {
  if (!id || id.includes("/")) throw new Error(`invalid doc id: ${id}`);
}

/** Firestore rejects `undefined`; strip it so a missing optional field never fails a write. */
function clean<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

export async function getOne<T>(collection: MpCollection, id: string): Promise<T | null> {
  assertId(id);
  if (storageMode() === "firestore") {
    const snap = await adminDb().collection(collection).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }
  if (storageMode() === "unavailable") return null;
  const store = await readLocal();
  return ((store[collection] ?? {})[id] as T | undefined) ?? null;
}

export async function listAll<T>(collection: MpCollection): Promise<T[]> {
  if (storageMode() === "firestore") {
    const snap = await adminDb().collection(collection).get();
    return snap.docs.map((doc) => doc.data() as T);
  }
  if (storageMode() === "unavailable") return [];
  const store = await readLocal();
  return Object.values(store[collection] ?? {}) as T[];
}

export async function putOne<T extends object>(collection: MpCollection, id: string, data: T): Promise<void> {
  assertId(id);
  assertAvailable();
  if (storageMode() === "firestore") {
    await adminDb().collection(collection).doc(id).set(clean(data));
    return;
  }
  await withLocalLock(async () => {
    const store = await readLocal();
    store[collection] = { ...(store[collection] ?? {}), [id]: clean(data) };
    await writeLocal(store);
  });
}

export async function deleteOne(collection: MpCollection, id: string): Promise<void> {
  assertId(id);
  assertAvailable();
  if (storageMode() === "firestore") {
    await adminDb().collection(collection).doc(id).delete();
    return;
  }
  await withLocalLock(async () => {
    const store = await readLocal();
    const col = { ...(store[collection] ?? {}) };
    delete col[id];
    store[collection] = col;
    await writeLocal(store);
  });
}

/**
 * Read-modify-write one document atomically (Firestore transaction / local lock).
 * `mutate` returns the new data, or null to abort without writing.
 */
export async function updateOne<T extends object, R = T>(
  collection: MpCollection,
  id: string,
  mutate: (current: T | null) => { data: T; result: R } | null
): Promise<R | null> {
  assertId(id);
  assertAvailable();
  if (storageMode() === "firestore") {
    const db = adminDb();
    const ref = db.collection(collection).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = mutate(snap.exists ? (snap.data() as T) : null);
      if (!next) return null;
      tx.set(ref, clean(next.data));
      return next.result;
    });
  }
  return withLocalLock(async () => {
    const store = await readLocal();
    const current = ((store[collection] ?? {})[id] as T | undefined) ?? null;
    const next = mutate(current);
    if (!next) return null;
    store[collection] = { ...(store[collection] ?? {}), [id]: clean(next.data) };
    await writeLocal(store);
    return next.result;
  });
}

/** Next number in a named sequence (P-001, T-001 …), atomic. */
export async function nextSequence(name: "proposal" | "task"): Promise<number> {
  const result = await updateOne<{ value: number }, number>("mp_meta", `seq-${name}`, (current) => {
    const value = (current?.value ?? 0) + 1;
    return { data: { value }, result: value };
  });
  return result ?? 1;
}

/** Make sure a sequence is at least `floor` (after an import with higher codes). */
export async function bumpSequence(name: "proposal" | "task", floor: number): Promise<void> {
  await updateOne<{ value: number }, null>("mp_meta", `seq-${name}`, (current) =>
    (current?.value ?? 0) >= floor ? null : { data: { value: floor }, result: null }
  );
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------- typed helpers

export async function getDoc(slug: string): Promise<MpDoc | null> {
  if (!isDocSlug(slug)) return null;
  return getOne<MpDoc>("mp_docs", slug);
}

export async function listDocs(): Promise<MpDoc[]> {
  return listAll<MpDoc>("mp_docs");
}

export async function addChangelog(entry: Omit<MpChangelog, "id">): Promise<void> {
  const id = newId("c");
  await putOne<MpChangelog>("mp_changelog", id, { id, ...entry });
}

/**
 * Save a new version of a doc. `baseVersion` must equal the stored version (optimistic
 * concurrency: two people editing at once → the second gets a conflict, nothing is lost).
 * Pass baseVersion = null to skip the check (imports).
 */
export async function saveDocVersion(input: {
  slug: string;
  title?: string;
  baseVersion: number | null;
  by: string;
  compute: (current: MpDoc | null) => string | { error: string };
  changelog: (version: number) => { summary: string; proposalCode: string | null };
}): Promise<MpDoc> {
  if (!isDocSlug(input.slug)) throw new Error("unknown doc");
  const now = new Date().toISOString();
  const state: { failure: string | null } = { failure: null };
  const saved = await updateOne<MpDoc, MpDoc>("mp_docs", input.slug, (current) => {
    const currentVersion = current?.version ?? 0;
    if (input.baseVersion !== null && input.baseVersion !== currentVersion) {
      state.failure = "conflict";
      return null;
    }
    const computed = input.compute(current);
    if (typeof computed !== "string") {
      state.failure = computed.error;
      return null;
    }
    const size = checkDocSize(computed);
    if (!size.ok) {
      state.failure = size.error;
      return null;
    }
    const doc: MpDoc = {
      slug: input.slug,
      title: (input.title || current?.title || DEFAULT_DOC_TITLES[input.slug as keyof typeof DEFAULT_DOC_TITLES]).slice(0, 200),
      markdown: computed,
      version: currentVersion + 1,
      updatedAt: now,
      updatedBy: input.by
    };
    return { data: doc, result: doc };
  });
  if (!saved) {
    if (state.failure === "conflict") throw new StoreConflictError("เอกสารถูกแก้ไปแล้วระหว่างนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
    throw new Error(state.failure || "save failed");
  }
  const note = input.changelog(saved.version);
  await addChangelog({ at: now, by: input.by, version: saved.version, proposalCode: note.proposalCode, summary: note.summary });
  return saved;
}

export async function getScratch(member: string): Promise<MpScratch | null> {
  return getOne<MpScratch>("mp_scratch", member);
}

export async function listProposals(): Promise<MpProposal[]> {
  const items = await listAll<MpProposal>("mp_proposals");
  return items.sort((a, b) => b.code.localeCompare(a.code, "en", { numeric: true }));
}

export async function getProposal(id: string): Promise<MpProposal | null> {
  return getOne<MpProposal>("mp_proposals", id);
}

export async function createProposalCode(): Promise<string> {
  return formatCode("P", await nextSequence("proposal"));
}

export async function listTasks(): Promise<MpTask[]> {
  const items = await listAll<MpTask>("mp_tasks");
  return items.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.code.localeCompare(b.code, "en", { numeric: true }));
}

export async function listChangelog(limit?: number): Promise<MpChangelog[]> {
  const items = (await listAll<MpChangelog>("mp_changelog")).sort((a, b) => b.at.localeCompare(a.at));
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

export async function listMeetings(): Promise<MpMeeting[]> {
  return (await listAll<MpMeeting>("mp_meetings")).sort((a, b) => b.date.localeCompare(a.date));
}
