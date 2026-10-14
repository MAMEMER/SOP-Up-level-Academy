import { requireUser } from "../../../../lib/auth.ts";
import { hasSessionSecret } from "../../../../lib/session-jwt.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { handoverActor } from "../../../../lib/customer-handover-server.ts";
import { CustomerHandoverBoard } from "../../../../components/CustomerHandoverBoard.tsx";
export const dynamic = "force-dynamic";
export default async function CustomerHandoverPage() {
  const user = await requireUser();
  let grant = { permissions: [] as string[], branches: [] as string[] };
  let unavailable = "";
  if (!hasSessionSecret() || !hasAdminCredentials()) unavailable = "โหมดดูหน้าจอ: ไม่เชื่อมข้อมูลลูกค้าจริง และไม่เปิดบันทึก";
  else { try { grant = (await handoverActor("read")).grant; } catch { unavailable = "บัญชีนี้ยังไม่ได้รับสิทธิ์ส่งมอบสินค้า หรือกำลังดูแทนบัญชีอื่น"; } }
  return <CustomerHandoverBoard account={user.actualEmail} grant={grant} unavailable={unavailable} />;
}
