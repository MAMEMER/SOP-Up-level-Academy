import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { GrandOpeningChecklist } from "../../../components/GrandOpeningChecklist.tsx";
export const dynamic = "force-dynamic";
export const metadata = { title: "เช็กลิสต์ Grand Opening | Up Level SOP" };
export default async function GrandOpeningChecklistPage() {
  const user = await requireUser();
  return <main className="page"><Link href="/" className="back-link">กลับหน้าหลัก</Link><section className="board-hero"><div><p className="eyebrow">Up Level · เสนาเฟสท์</p><h2>เช็กลิสต์ Grand Opening</h2><p>เสาร์ 17 – อาทิตย์ 18 ตุลาคม 2026 · เตรียมของและทีมให้พร้อมไปด้วยกัน</p></div></section><GrandOpeningChecklist readOnly={user.isImpersonating} userKey={user.actualEmail} userName={user.actualName} /></main>;
}
