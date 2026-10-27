// Per-person AI tokens for the Masterplan (Claude custom connector / read link).
//
// The token itself is shown to its owner ONCE; only sha256(token) is stored, as the doc id
// of mp_tokens/{hash}. A token acts as exactly one member and can never do more than the
// MCP tool list allows (no verdicts, no applying, no direct edits, no imports, no token
// management). Pure + store-injected so it is unit-testable without Firestore.

import { createHash, randomBytes } from "node:crypto";
import { memberByKey, type MasterplanMember } from "./masterplan-access.ts";

export const TOKEN_PREFIX = "mp_";
export const MAX_ACTIVE_TOKENS = 5;
/** lastUsedAt is written at most this often (keeps a chatty AI from writing on every call). */
export const LAST_USED_THROTTLE_MS = 60_000;

export type MpToken = {
  hash: string;
  member: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** The minimal store surface the token + MCP code needs (masterplan-store.ts implements it). */
export type MpStore = {
  getOne<T>(collection: string, id: string): Promise<T | null>;
  listAll<T>(collection: string): Promise<T[]>;
  putOne<T extends object>(collection: string, id: string, data: T): Promise<void>;
  updateOne<T extends object, R = T>(collection: string, id: string, mutate: (current: T | null) => { data: T; result: R } | null): Promise<R | null>;
  nextSequence(name: "proposal" | "task"): Promise<number>;
};

/** 32 random bytes, base64url, "mp_" prefix → 46 chars. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap shape check before touching the store (rejects junk paths without a lookup). */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^mp_[A-Za-z0-9_-]{40,64}$/.test(value);
}

export function isActive(token: Pick<MpToken, "revokedAt">): boolean {
  return !token.revokedAt;
}

export function validateLabel(label: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof label === "string" ? label.trim() : "";
  if (!value) return { ok: false, error: "ตั้งชื่อ token ก่อน เช่น \"Claude ของท้อป\"" };
  if (value.length > 80) return { ok: false, error: "ชื่อยาวเกินไป" };
  return { ok: true, value };
}

export type VerifiedToken = { token: MpToken; member: MasterplanMember };

/** Resolve a raw token to its member, or null (unknown, revoked, or member no longer listed). */
export async function verifyToken(store: MpStore, raw: unknown): Promise<VerifiedToken | null> {
  if (!looksLikeToken(raw)) return null;
  const record = await store.getOne<MpToken>("mp_tokens", hashToken(raw));
  if (!record || !isActive(record)) return null;
  const member = memberByKey(record.member);
  if (!member) return null;
  return { token: record, member };
}

export async function touchToken(store: MpStore, token: MpToken, now: Date = new Date()): Promise<void> {
  const last = token.lastUsedAt ? Date.parse(token.lastUsedAt) : 0;
  if (now.getTime() - last < LAST_USED_THROTTLE_MS) return;
  await store.updateOne<MpToken>("mp_tokens", token.hash, (current) =>
    current && !current.revokedAt ? { data: { ...current, lastUsedAt: now.toISOString() }, result: current } : null
  );
}

export async function listMyTokens(store: MpStore, memberKey: string): Promise<MpToken[]> {
  const all = await store.listAll<MpToken>("mp_tokens");
  return all.filter((t) => t.member === memberKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createToken(
  store: MpStore,
  memberKey: string,
  label: unknown,
  now: Date = new Date()
): Promise<{ ok: true; token: string; record: MpToken } | { ok: false; error: string }> {
  const checked = validateLabel(label);
  if (!checked.ok) return checked;
  const mine = await listMyTokens(store, memberKey);
  if (mine.filter(isActive).length >= MAX_ACTIVE_TOKENS) {
    return { ok: false, error: `มี token ที่ใช้งานอยู่ครบ ${MAX_ACTIVE_TOKENS} อันแล้ว — ยกเลิกอันที่ไม่ใช้ก่อน` };
  }
  const token = generateToken();
  const record: MpToken = { hash: hashToken(token), member: memberKey, label: checked.value, createdAt: now.toISOString(), lastUsedAt: null, revokedAt: null };
  await store.putOne<MpToken>("mp_tokens", record.hash, record);
  return { ok: true, token, record };
}

/** Revoke one of MY tokens (by its hash id). Someone else's token → false, untouched. */
export async function revokeToken(store: MpStore, memberKey: string, hash: string, now: Date = new Date()): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  const done = await store.updateOne<MpToken, boolean>("mp_tokens", hash, (current) => {
    if (!current || current.member !== memberKey || current.revokedAt) return null;
    return { data: { ...current, revokedAt: now.toISOString() }, result: true };
  });
  return Boolean(done);
}

/** Best-effort per-instance sliding window (same stance as /api/help-chat). */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return recent.length > max;
  };
}
