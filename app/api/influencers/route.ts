import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { actor, canWriteNow, db, readOnly, badRequest } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { hasSessionSecret } from "../../../lib/session-jwt.ts";
import { influencerSchema, initialInfluencers, mergeInfluencers, type Influencer } from "../../../lib/influencers.ts";

export const dynamic = "force-dynamic";
const collection = "sop_influencers";
const available = () => hasAdminCredentials() && hasSessionSecret();
export async function GET(request: Request) {
  await actor();
  if (!available()) return NextResponse.json({ mode: "preview", rows: initialInfluencers, history: [] });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      if (!/^[\w-]{1,100}$/.test(id)) return badRequest();
      const events = await db().collection(collection).doc(id).collection("history").orderBy("at", "desc").limit(100).get();
      return NextResponse.json({ history: events.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
    }
    const rows = await db().collection(collection).get();
    return NextResponse.json({ mode: "shared", rows: mergeInfluencers(rows.docs.map(doc => ({ ...doc.data(), id: doc.id } as Influencer))) });
  } catch {
    return NextResponse.json({ error: "โหลดข้อมูลทีมไม่ได้ กรุณาลองใหม่" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!available()) return NextResponse.json({ error: "ยังไม่พร้อมบันทึกข้อมูลทีม" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const fields = influencerSchema.safeParse(body?.fields);
  if (!fields.success || !Number.isInteger(body?.revision) || body.revision < 0 || typeof body?.id !== "string" || !/^[\w-]{1,100}$/.test(body.id)) return badRequest("ข้อมูลช่องไม่ถูกต้อง");
  const ref = db().collection(collection).doc(body.id);
  const event = ref.collection("history").doc(randomUUID());
  try {
    const result = await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const previous = snap.exists ? snap.data() as Influencer : initialInfluencers.find(row => row.id === body.id);
      if ((previous?.revision || 0) !== body.revision) throw new Error("conflict");
      const next = { ...fields.data, revision: body.revision + 1 };
      tx.set(ref, next);
      // One atomic commit preserves the complete old and new values; no delete endpoint.
      tx.create(event, { at: new Date().toISOString(), by: user.actualName, before: previous ? influencerSchema.parse(previousFields(previous)) : null, after: fields.data });
      return { ...next, id: ref.id };
    });
    return NextResponse.json({ row: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "conflict" ? "ทีมเพิ่งแก้ช่องนี้ โหลดข้อมูลล่าสุดแล้วเทียบกับร่างก่อนบันทึก" : "บันทึกไม่สำเร็จ ร่างยังอยู่ กรุณาลองใหม่" }, { status: error instanceof Error && error.message === "conflict" ? 409 : 503 });
  }
}
function previousFields(row: Influencer) {
  const { id: _id, revision: _revision, ...fields } = row;
  return fields;
}
