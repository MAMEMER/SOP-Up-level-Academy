// Minimal server-side Firestore access via the REST API + public API key. Used for the
// SOP manual-entry records (complaint / assigned work) so they PERSIST on Vercel — the
// old local-JSON store is wiped on every serverless cold start. These collections are
// open (`if true`) in firestore.rules, matching the other internal SOP tools, so the
// public API key is sufficient (app-level gated by the SOP login). Only primitive
// field types (string / number / boolean) are needed here.

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "up-level-guild";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAKxWv3FI7HrdrRlnJhsQbJ-97Pb_sdiOQ";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

type Primitive = string | number | boolean;
type FieldValue = Primitive | string[];

function encodeValue(value: FieldValue): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => ({ stringValue: String(item) })) } };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
}

function encodeFields(obj: Record<string, FieldValue | undefined>) {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return fields;
}

function decodeValue(v: Record<string, unknown>): FieldValue | undefined {
  if ("stringValue" in v) return v.stringValue as string;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return Boolean(v.booleanValue);
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: Record<string, unknown>[] })?.values || [];
    return values.map((item) => String(decodeValue(item) ?? ""));
  }
  return undefined;
}

function decodeDoc(doc: { fields?: Record<string, Record<string, unknown>> }): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    const decoded = decodeValue(value);
    if (decoded !== undefined) out[key] = decoded;
  }
  return out;
}

/** Reads every document in a collection (small collections only). Returns [] on error. */
export async function restListCollection<T>(collection: string): Promise<T[]> {
  const docs: T[] = [];
  let pageToken = "";
  try {
    do {
      const url = `${BASE}/${collection}?key=${API_KEY}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) break;
      const data = (await res.json()) as { documents?: Array<{ fields?: Record<string, Record<string, unknown>> }>; nextPageToken?: string };
      for (const doc of data.documents || []) docs.push(decodeDoc(doc) as T);
      pageToken = data.nextPageToken || "";
    } while (pageToken);
  } catch {
    return docs;
  }
  return docs;
}

/**
 * Upserts a document by id. Uses a field-scoped updateMask so it MERGES the provided
 * fields into an existing doc (rather than replacing it) — e.g. a clock-in sync won't
 * wipe a leave record already on the same schedule_actual doc. Creates the doc if new.
 */
export async function restUpsertDoc(collection: string, docId: string, data: Record<string, FieldValue | undefined>): Promise<void> {
  const fields = encodeFields(data);
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join("&");
  const url = `${BASE}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}&${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Firestore upsert failed: ${res.status}`);
}
