import { NextResponse } from "next/server";
import { actor, db, isAdmin } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { employeeCodes } from "../../../lib/employee-directory.ts";
import {
  FLOWER_BILLS_COLLECTION,
  FLOWER_GRANTS_COLLECTION,
  bangkokMonth,
  monthlyTargetPetals,
  newestFirst,
  summarise,
  type FlowerReceived
} from "../../../lib/flower-garden.ts";

// สวนดอกไม้ของพนักงาน — อ่านอย่างเดียว
//
// **ตัวตนผู้ให้ไม่เคยออกจาก server ตัวนี้** ไม่ว่าใครเรียก. เอกสารใน `flower_grants`
// มี giverEmail/giverUid/giverName อยู่ ซึ่งตกลงกันว่าเจ้าของเห็นชั้นเดียวที่จอ
// /admin/flowers ของเว็บกิลด์ — การส่งมาให้ client แล้วค่อยซ่อนด้วย CSS ไม่นับว่าซ่อน
//
// พนักงานเห็นของตัวเองเท่านั้น · หัวหน้าเปิดดูของคนอื่นได้เพื่อใช้ตอนประเมิน

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : "");

type GrantDoc = {
  id?: string;
  kind?: string;
  petals?: number;
  message?: string;
  photos?: string[];
  rank?: string;
  invoiceNumber?: string;
  createdAt?: string;
};

/** ตัดทุกอย่างที่บอกได้ว่าใครให้ ออกตั้งแต่ฝั่ง server */
function stripGiver(id: string, row: GrantDoc): FlowerReceived {
  return {
    id,
    kind: row.kind === "leaf" ? "leaf" : "flower",
    petals: Number(row.petals) || 0,
    // ข้อความของใบไม้แห้งไม่ส่งมา — ต้องรอหัวหน้าเปิดที่ช่องเสียงจากสมาชิกตามเดิม
    message: row.kind === "leaf" ? "" : str(row.message),
    photos: row.kind === "leaf" ? [] : (Array.isArray(row.photos) ? row.photos.map(String) : []),
    rank: str(row.rank),
    invoiceNumber: str(row.invoiceNumber),
    createdAt: str(row.createdAt)
  };
}

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const requested = str(new URL(request.url).searchParams.get("staffCode")).trim();
  const admin = isAdmin(user);
  const target = admin ? requested || staffCode : staffCode;
  const month = str(new URL(request.url).searchParams.get("month")).trim() || bangkokMonth();

  if (!target || !hasAdminCredentials()) {
    return NextResponse.json({ items: [], summary: null, targetPetals: 0, month });
  }

  try {
    const snap = await db().collection(FLOWER_GRANTS_COLLECTION).where("staffCode", "==", target).get();
    const all = snap.docs.map((doc) => stripGiver(doc.id, doc.data() as GrantDoc));
    const items = newestFirst(all.filter((item) => bangkokMonth(item.createdAt) === month));

    // เกณฑ์ของเดือน = ครึ่งหนึ่งของกลีบที่บิลทั้งเดือนแจกได้ หารจำนวนพนักงาน
    const billSnap = await db().collection(FLOWER_BILLS_COLLECTION).get();
    const potentialPetals = billSnap.docs
      .map((doc) => doc.data() as { petals?: number; transactionTime?: string })
      .filter((bill) => bangkokMonth(str(bill.transactionTime)) === month)
      .reduce((sum, bill) => sum + (Number(bill.petals) || 0), 0);

    return NextResponse.json({
      items,
      summary: summarise(items),
      targetPetals: monthlyTargetPetals(potentialPetals, employeeCodes.length),
      potentialPetals,
      staffCount: employeeCodes.length,
      month,
      isAdminView: admin
    });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}
