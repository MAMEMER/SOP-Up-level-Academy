import "server-only";
import { createSign } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { requireUser } from "./auth.ts";
import { hasSessionSecret } from "./session-jwt.ts";
import { employeeCodeForEmail, branchFor } from "./employee-directory.ts";
import { grantFor, authorized, type HandoverGrant, type HandoverPermission } from "./customer-handover-access.ts";
import { adaptOrder, adaptSheet, SHEETS, hash, normalizePhone, maskPhone, canDeliver, applyMovement, integer, type HandoverLine, type Balance, type EventType, type Source } from "./customer-handover.ts";

const EVENTS = "customer_handover_events";
const BALANCES = "customer_fulfillment_balances";
export async function handoverActor(permission: HandoverPermission, branch?: string) {
  // Do not invoke preview-admin fallback for sensitive reads or writes.
  if (!hasSessionSecret() || !hasAdminCredentials()) throw new Error("ระบบข้อมูลจริงยังไม่พร้อม ไม่มี session หรือ credentials");
  const user = await requireUser();
  let grants: Record<string, HandoverGrant> = {};
  try { grants = JSON.parse(process.env.CUSTOMER_HANDOVER_GRANTS || "{}"); } catch { throw new Error("การตั้งค่าสิทธิ์ไม่ถูกต้อง"); }
  const grant = grantFor(user.actualEmail, grants);
  // This task authorizes the staff menu/read workflow; recording remains an explicit grant.
  if (!grant.permissions.length) { grant.permissions = ["read"]; grant.branches = [branchFor(employeeCodeForEmail(user.actualEmail) || "")]; }
  if (!authorized(permission, grant, { realSession: hasSessionSecret(), credentials: hasAdminCredentials(), impersonating: user.isImpersonating, branch })) throw new Error("ไม่มีสิทธิ์ หรืออยู่ในโหมดดูแทน");
  return { user, grant, staffCode: employeeCodeForEmail(user.actualEmail) || "" };
}
async function sheetRows(id: string, tab: string): Promise<string[][]> {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign((process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")).toString("base64url");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(12000) });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("เข้าถึงชีตไม่ได้");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1:AD5000`)}`, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("อ่านชีตไม่ได้");
  const data = await response.json();
  if (data.values?.length >= 5000) throw new Error("ชีตเกินขอบเขต ต้องตรวจเพิ่ม");
  return data.values ?? [];
}
/** Bounded server-only scan accommodates legacy phones in mixed formats without unsafe suffix matching. */
export async function loadSources(phone?: string) {
  const db = adminDb();
  const sources: Source[] = ["shop-orders", "shop_orders", "set14-orders", "bundle-orders"];
  const jobs = [...sources.map(async source => {
    const snap = await db.collection(source).select("customer.phone", "customer.name", "phone", "name", "userPhone", "items", "product", "qty", "totalPieces", "status", "slipStatus", "shippedAt", "trackingNumber", "fulfillment", "itemCategory", "itemId", "itemName", "effectType", "bundleId", "bundleName").limit(2001).get();
    if (snap.size > 2000) throw new Error("ต้องเพิ่มดัชนีค้นหา");
    // BOM must be certified separately; absence always blocks bundles.
    return snap.docs.flatMap(doc => adaptOrder(source, doc.id, doc.data()));
  }), ...SHEETS.map(async sheet => adaptSheet(sheet.source, sheet.id, sheet.tab, await sheetRows(sheet.id, sheet.tab)))];
  const results = await Promise.allSettled(jobs);
  const missing: string[] = [];
  const lines: HandoverLine[] = [];
  results.forEach((result, i) => { if (result.status === "fulfilled") lines.push(...result.value); else missing.push([...sources, ...SHEETS.map(s => s.source)][i]); });
  return { lines: phone ? lines.filter(line => line.phone === phone) : lines, missing, loadedAt: new Date().toISOString() };
}
export async function lookup(phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new Error("กรอกเบอร์มือถือไทยให้ครบ 10 หลัก");
  const data = await loadSources(phone);
  const db = adminDb();
  const lines = await Promise.all(data.lines.map(async line => {
    const snap = await db.collection(BALANCES).doc(line.key).get();
    const balance = snap.exists ? snap.data() as Balance : null;
    return { ...line, phone: maskPhone(phone), balance, ready: data.missing.length === 0 && canDeliver(line, balance ?? undefined), openingPending: !balance?.approved };
  }));
  return { ...data, lines, phone: maskPhone(phone) };
}
export async function pendingOpenings() {
  const data = await loadSources();
  const lines = await Promise.all(data.lines.map(async line => {
    const balance = await adminDb().collection(BALANCES).doc(line.key).get();
    return { key: line.key, source: line.source, sourceKey: line.sourceKey, orderId: line.orderId, phone: maskPhone(line.phone), productName: line.productName, entitlement: line.entitlement, unit: line.unit, fingerprint: line.fingerprint, blockers: line.blockers, shipped: line.shipped, paid: line.paid, approved: balance.data()?.approved === true, previouslyReceived: null, cancelled: null, outstanding: null };
  }));
  return { ...data, lines: lines.filter(line => !line.approved), status: "รอแชมป์รับรอง ไม่ได้นำเข้า", importEnabled: false };
}
export async function history(branch: string, phoneInput?: string) {
  let query = adminDb().collection(EVENTS).where("branchId", "==", branch);
  // A bounded branch query needs no new production index; paginate by document ID.
  const snap = await query.limit(501).get();
  const phone = phoneInput ? normalizePhone(phoneInput) : "";
  if (phoneInput && !phone) throw new Error("เบอร์ไม่ถูกต้อง");
  return { events: snap.docs.map(doc => doc.data()).filter(e => !phone || e.customerPhoneNormalized === phone).map(e => ({ ...e, customerPhoneNormalized: maskPhone(e.customerPhoneNormalized), recordedAt: e.recordedAt?.toDate?.().toISOString() ?? "" })).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)), truncated: snap.size > 500 };
}
export async function record(input: any, actor: Awaited<ReturnType<typeof handoverActor>>) {
  const phone = normalizePhone(input.phone);
  if (!phone || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId ?? "")) throw new Error("เบอร์หรือเลขคำขอไม่ถูกต้อง");
  const type: EventType = input.type;
  if (!["handover", "return", "cancel_entitlement", "reversal"].includes(type)) throw new Error("ไม่เปิดนำเข้ายอดตั้งต้น");
  if (type !== "handover" && !actor.grant.permissions.includes("correct")) throw new Error("ไม่มีสิทธิ์แก้รายการ");
  if (!actor.grant.branches.includes(input.branch)) throw new Error("ไม่มีสิทธิ์สาขานี้");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 30) throw new Error("เลือก 1 ถึง 30 รายการ");
  if (new Set(input.lines.map((line: any) => line.key)).size !== input.lines.length) throw new Error("รายการซ้ำ");
  const reason = String(input.reason ?? "").trim();
  if (type !== "handover" && (reason.length < 5 || reason.length > 500)) throw new Error("กรอกเหตุผล 5 ถึง 500 ตัวอักษร");
  const recipient = { type: input.recipient?.type || "self", name: String(input.recipient?.name ?? "").trim(), verification: String(input.recipient?.verification ?? "").trim() };
  if (type === "handover" && (!["self", "representative"].includes(recipient.type) || recipient.verification.length < 5 || recipient.verification.length > 300 || (recipient.type === "representative" && !recipient.name) || recipient.name.length > 120)) throw new Error("ระบุผู้รับและวิธียืนยันกับออเดอร์");
  const disposition = input.returnDisposition === "close" ? "close" : "replace";
  const eventId = hash([actor.user.actualEmail, input.requestId]);
  // Canonical payload binds actor, branch, phone, operation and exact line quantities.
  const normalized = input.lines.map((line: any) => ({ key: String(line.key), quantity: integer(line.quantity), fingerprint: String(line.fingerprint), referenceEventId: String(line.referenceEventId ?? "") }));
  if (normalized.some((l: any) => !/^[a-f0-9]{64}$/.test(l.key) || (l.referenceEventId && !/^[a-f0-9]{64}$/.test(l.referenceEventId)))) throw new Error("เลขรายการไม่ถูกต้อง");
  const requestHash = hash({ phone, type, branch: input.branch, lines: normalized, recipient, reason, disposition });
  const db = adminDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const existing = await eventRef.get();
  if (existing.exists) { if (existing.data()?.requestHash !== requestHash) throw new Error("คำขอเดิมแต่เนื้อหาเปลี่ยน"); return { eventId, duplicate: true }; }
  const sourceData = await loadSources(phone);
  if (sourceData.missing.length) throw new Error("ข้อมูลบางแหล่งขาด ห้ามบันทึก");
  // Separate writers have not been retired yet: fail closed until owner configures the exclusive writer gate.
  if (process.env.CUSTOMER_HANDOVER_EXCLUSIVE_WRITER !== "true") throw new Error("รอเปิดช่องทางส่งมอบหลักโดยแชมป์");
  await db.runTransaction(async tx => {
    const previous = await tx.get(eventRef);
    if (previous.exists) { if (previous.data()?.requestHash !== requestHash) throw new Error("คำขอเดิมแต่เนื้อหาเปลี่ยน"); return; }
    const refs = normalized.map((line: any) => db.collection(BALANCES).doc(line.key));
    const balances = await Promise.all(refs.map((ref: any) => tx.get(ref)));
    const referenceIds = [...new Set<string>(normalized.map((line: any) => line.referenceEventId).filter(Boolean))];
    const originals = await Promise.all(referenceIds.map(id => tx.get(db.collection(EVENTS).doc(id))));
    const usageRefs = normalized.map((line: any) => db.collection("customer_handover_reference_usage").doc(hash([line.referenceEventId, line.key])));
    const usages = await Promise.all(usageRefs.map((ref: any) => tx.get(ref)));
    const snapshots: any[] = [];
    const nextBalances: Balance[] = [];
    normalized.forEach((line: any, i: number) => {
      const current = sourceData.lines.find(candidate => candidate.key === line.key);
      const balance = balances[i].data() as Balance | undefined;
      if (!current || !balance?.approved || balance.fingerprint !== current.fingerprint || line.fingerprint !== current.fingerprint) throw new Error("ยอดตั้งต้นยังไม่รับรอง หรือข้อมูลต้นทางเปลี่ยน");
      if (type === "handover" && !canDeliver(current, balance)) throw new Error("รายการยังไม่พร้อมส่งมอบ");
      let reverseType: EventType | undefined;
      if (type === "return" || type === "reversal") {
        const original = originals.find(doc => doc.id === line.referenceEventId)?.data();
        const originalLine = original?.lines.find((l: any) => l.key === line.key);
        if (!original || original.customerPhoneNormalized !== phone || original.branchId !== input.branch || !originalLine || (type === "return" && original.type !== "handover")) throw new Error("อ้างรายการเดิมไม่ถูกต้อง");
        if (Number(usages[i].data()?.quantity ?? 0) + line.quantity > originalLine.quantity) throw new Error("คืนหรือกลับรายการเกินจำนวนเดิม");
        reverseType = original.type;
      }
      nextBalances.push(applyMovement(balance, type as Exclude<EventType, "opening_balance">, line.quantity, disposition, reverseType));
      snapshots.push({ ...line, sourceKey: current.sourceKey, lineKey: current.lineKey, source: current.source, canonicalOrderId: current.orderId, productId: current.productId, productNameSnapshot: current.productName, unit: current.unit, paymentEvidence: { paid: current.paid }, sourceVersion: current.fingerprint });
    });
    tx.create(eventRef, { schemaVersion: 1, eventId, requestId: input.requestId, requestHash, type, customerPhoneNormalized: phone, recipient, branchId: input.branch, actorId: actor.user.actualEmail, actorStaffCode: actor.staffCode, actorNameSnapshot: actor.user.actualName, recordedAt: FieldValue.serverTimestamp(), businessDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()), lines: snapshots, reason, returnDisposition: disposition });
    refs.forEach((ref: any, i: number) => tx.set(ref, { ...nextBalances[i], lastEventId: eventId, version: Number(balances[i].data()?.version ?? 0) + 1 }));
    if (type === "return" || type === "reversal") usageRefs.forEach((ref: any, i: number) => tx.set(ref, { quantity: Number(usages[i].data()?.quantity ?? 0) + normalized[i].quantity }));
  });
  return { eventId, duplicate: false };
}
