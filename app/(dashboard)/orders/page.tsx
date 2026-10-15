import { CustomerOrdersBoard } from "../../../components/CustomerOrdersBoard.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { FILTERS, type Filter } from "../../../lib/customer-orders.ts";

// ออเดอร์ลูกค้าทุกช่องทางในที่เดียว — ค้นเบอร์/ชื่อ ดูสถานะจ่าย/ส่ง แล้วบันทึกการส่งมอบตรงนี้.
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireUser();
  const { f, q } = await searchParams;
  const filter = FILTERS.some((x) => x.value === f) ? (f as Filter) : "todo";
  return (
    <main className="page">
      <CustomerOrdersBoard initialFilter={filter} initialQuery={(q || "").slice(0, 60)} />
    </main>
  );
}
