import Link from "next/link";
import { fetchSupplyNeeds, hasSupplyNeedsSource } from "../lib/storehub-supply-needs.ts";
import { hasAdminCredentials } from "../lib/firebase-admin.ts";
import { listSupplyOrders } from "../lib/supply-orders-server.ts";
import { findPending, pendingSupplies, type PendingSupply } from "../lib/supply-orders.ts";

// แถบ "ของที่ต้องสั่ง" บนหน้าหลักของพนักงาน — อยู่บนสุดเพื่อไม่ให้ลืมสั่งของ.
// ดึงจาก StoreHub (แคชไว้แล้วใน lib) ถ้าดึงไม่ได้หรือไม่มีของต้องสั่ง = ไม่ขึ้นอะไรเลย
// จะได้ไม่กลายเป็นแถบว่างที่ทุกคนเรียนรู้ที่จะมองข้าม.
export async function SupplyNeedsBanner({ branch }: { branch: string }) {
  if (!hasSupplyNeedsSource()) return null;

  let result: Awaited<ReturnType<typeof fetchSupplyNeeds>>;
  try {
    result = await fetchSupplyNeeds(undefined, branch);
  } catch {
    return null;
  }

  // ของที่ลงออเดอร์ไว้แล้ว (สั่งแล้ว รอส่ง) ไม่ต้องเตือนให้สั่งซ้ำ
  let pending: PendingSupply[] = [];
  if (hasAdminCredentials()) {
    try {
      pending = pendingSupplies(await listSupplyOrders({ branch }));
    } catch {
      pending = [];
    }
  }
  const must = (result.plan?.must ?? result.items).filter((item) => !findPending(item, pending));
  if (must.length === 0) return null;

  const plan = result.plan;
  const grandTotal = pending.length
    ? must.reduce((total, item) => total + (item.estimatedCost ?? 0), 0)
    : plan?.grandTotal ?? result.estimatedTotal ?? 0;
  const baht = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
  const preview = must.slice(0, 3).map((item) => item.name);
  const rest = must.length - preview.length;

  return (
    <Link href="/supplies" className="supply-banner">
      <span className="supply-banner-title">
        ของที่ต้องสั่ง {must.length} รายการ
        {grandTotal > 0 ? ` · ทั้งบิล ≈ ${baht(grandTotal)} บาท` : ""}
      </span>
      <span className="supply-banner-items">
        {preview.join(" · ")}
        {rest > 0 ? ` และอีก ${rest} รายการ` : ""}
      </span>
      {plan && plan.minOrderValue > 0 && !pending.length ? (
        <span className="supply-banner-items">
          {plan.reachedMinimum
            ? plan.suggested.length > 0
              ? `เสนอของขายดีเพิ่ม ${plan.suggested.length} รายการ ให้ถึงขั้นต่ำ ${baht(plan.minOrderValue)} บาท`
              : `ถึงยอดขั้นต่ำ ${baht(plan.minOrderValue)} บาทแล้ว`
            : `ยังขาดอีก ${baht(plan.shortOfMinimum)} บาทถึงจะสั่งได้`}
        </span>
      ) : null}
      <span className="supply-banner-cta">ดูแผนการสั่ง →</span>
    </Link>
  );
}
