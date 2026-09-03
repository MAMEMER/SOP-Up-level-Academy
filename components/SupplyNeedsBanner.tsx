import Link from "next/link";
import { fetchSupplyNeeds, hasSupplyNeedsSource } from "../lib/storehub-supply-needs.ts";

// แถบ "ของที่ต้องสั่ง" บนหน้าหลักของพนักงาน — อยู่บนสุดเพื่อไม่ให้ลืมสั่งของ.
// ดึงจาก StoreHub (แคชไว้แล้วใน lib) ถ้าดึงไม่ได้หรือไม่มีของต้องสั่ง = ไม่ขึ้นอะไรเลย
// จะได้ไม่กลายเป็นแถบว่างที่ทุกคนเรียนรู้ที่จะมองข้าม.
export async function SupplyNeedsBanner() {
  if (!hasSupplyNeedsSource()) return null;

  let items: Awaited<ReturnType<typeof fetchSupplyNeeds>>["items"] = [];
  let total = 0;
  try {
    const result = await fetchSupplyNeeds();
    items = result.items;
    total = result.estimatedTotal ?? 0;
  } catch {
    return null;
  }
  if (items.length === 0) return null;

  const preview = items.slice(0, 3).map((item) => item.name);
  const rest = items.length - preview.length;

  return (
    <Link href="/supplies" className="supply-banner">
      <span className="supply-banner-title">
        ของที่ต้องสั่ง {items.length} รายการ
        {total > 0 ? ` · ≈ ${total.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท` : ""}
      </span>
      <span className="supply-banner-items">
        {preview.join(" · ")}
        {rest > 0 ? ` และอีก ${rest} รายการ` : ""}
      </span>
      <span className="supply-banner-cta">ดูรายการที่ต้องสั่ง →</span>
    </Link>
  );
}
