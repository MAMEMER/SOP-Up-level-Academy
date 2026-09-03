import Link from "next/link";
import { fetchSupplyNeeds, hasSupplyNeedsSource } from "../lib/storehub-supply-needs.ts";

// แถบ "ของที่ต้องสั่ง" บนหน้าหลักของพนักงาน — อยู่บนสุดเพื่อไม่ให้ลืมสั่งของ.
// ดึงจาก StoreHub (แคชไว้แล้วใน lib) ถ้าดึงไม่ได้หรือไม่มีของต้องสั่ง = ไม่ขึ้นอะไรเลย
// จะได้ไม่กลายเป็นแถบว่างที่ทุกคนเรียนรู้ที่จะมองข้าม.
export async function SupplyNeedsBanner() {
  if (!hasSupplyNeedsSource()) return null;

  let result: Awaited<ReturnType<typeof fetchSupplyNeeds>>;
  try {
    result = await fetchSupplyNeeds();
  } catch {
    return null;
  }

  const must = result.plan?.must ?? result.items;
  if (must.length === 0) return null;

  const plan = result.plan;
  const grandTotal = plan?.grandTotal ?? result.estimatedTotal ?? 0;
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
      {plan && plan.minOrderValue > 0 ? (
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
