import Link from "next/link";
import { SuppliesCopyButton } from "../../../components/SuppliesCopyButton.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { branchConfig } from "../../../lib/store-config.ts";
import {
  fetchSupplyNeeds,
  hasSupplyNeedsSource,
  type SupplyNeedItem,
  type SupplyNeedsResult
} from "../../../lib/storehub-supply-needs.ts";

// หน้า "ของที่ต้องสั่ง" — ดึงสดจาก StoreHub (คงเหลือ vs จุดสั่งซื้อ) แล้วเสนอเป็นแผนการสั่งหนึ่งรอบ:
// ของที่ยังไงก็ต้องสั่ง + ของที่ควรหยิบเพิ่มให้บิลถึงยอดขั้นต่ำของ Makro โดยเลือกจากของขายดี.
export const dynamic = "force-dynamic";

const storeHubSupplyNeedsUrl = "https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web";

function baht(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function orderLine(item: SupplyNeedItem): string {
  const qty = item.orderQty ?? 0;
  const money = item.estimatedCost ? ` ≈ ฿${baht(item.estimatedCost)}` : "";
  return `${item.name} × ${qty}${money}`;
}

function SupplyRow({ item, showNote }: { item: SupplyNeedItem; showNote?: boolean }) {
  const qty = item.orderQty ?? 0;
  return (
    <li className="supply-row">
      <div className="supply-row-main">
        <span className="supply-alert-name">{item.name}</span>
        <small>
          {showNote && item.note
            ? item.note
            : `เหลือ ${item.remaining}${item.reorderPoint ? ` · จุดสั่งซื้อ ${item.reorderPoint}` : ""}${
                item.category ? ` · ${item.category}` : ""
              }`}
        </small>
      </div>
      <div className="supply-row-order">
        <span className="supply-alert-qty">{qty > 0 ? `สั่ง ${qty}` : "ยังไม่ตั้งจำนวนที่ควรมี"}</span>
        <small>
          {item.estimatedCost
            ? `≈ ฿${baht(item.estimatedCost)}${item.costSource === "price" ? "*" : ""}`
            : "ไม่มีต้นทุนในระบบ"}
        </small>
      </div>
    </li>
  );
}

export default async function SuppliesPage() {
  const user = await requireUser();
  const staffCode = resolveEmployeeByEmail(user.email);
  const branch = staffCode ? branchFor(staffCode) : "bangkae";
  const config = branchConfig(branch);

  let result: SupplyNeedsResult | null = null;
  let error: string | null = null;
  if (!hasSupplyNeedsSource()) {
    error = "ยังไม่ได้ตั้งค่าเชื่อม StoreHub บนเซิร์ฟเวอร์ (STOREHUB_USER / STOREHUB_PASS)";
  } else {
    try {
      result = await fetchSupplyNeeds();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  const plan = result?.plan ?? null;
  const must = plan?.must ?? result?.items ?? [];
  const suggested = plan?.suggested ?? [];
  const minimum = plan?.minOrderValue ?? config.supplyMinOrderValue ?? 0;
  const mustTotal = plan?.mustTotal ?? result?.estimatedTotal ?? 0;
  const grandTotal = plan?.grandTotal ?? mustTotal;
  const short = plan?.shortOfMinimum ?? Math.max(minimum - grandTotal, 0);
  const reached = plan?.reachedMinimum ?? grandTotal >= minimum;

  const copyText = [...must, ...suggested].map(orderLine).join("\n");
  const guessedPriceCount = [...must, ...suggested].filter((item) => item.costSource === "price").length;

  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← กลับหน้าหลัก
      </Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">StoreHub</p>
          <h2>ของที่ต้องสั่ง</h2>
          <p>
            ดึงสดจากสต๊อก {config.displayName} — ของที่ถึงจุดสั่งซื้อแล้ว บวกข้อเสนอว่าควรหยิบอะไรเพิ่ม
            ให้บิลถึงยอดขั้นต่ำ {baht(minimum)} บาท
            {result?.fetchedAt ? ` · อัปเดต ${formatFetchedAt(result.fetchedAt)}` : ""}
          </p>
        </div>
      </section>

      {error ? (
        <section className="supply-panel">
          <p className="detail-hint">ดึงข้อมูลจาก StoreHub ไม่สำเร็จ — {error}</p>
          <a href={storeHubSupplyNeedsUrl} target="_blank" rel="noreferrer" className="detail-action-link">
            เปิด StoreHub Supply Needs เอง
          </a>
        </section>
      ) : null}

      {result && must.length === 0 ? (
        <section className="supply-panel">
          <p className="detail-hint">ตอนนี้ไม่มีของที่ถึงจุดสั่งซื้อ — ยังไม่ต้องสั่งอะไร</p>
        </section>
      ) : null}

      {must.length > 0 ? (
        <section className="supply-panel">
          <div className="supply-total">
            <div>
              <strong>รวมทั้งบิล</strong>
              <span className="supply-total-amount">≈ {baht(grandTotal)} บาท</span>
            </div>
            {minimum > 0 ? (
              <p className={reached ? "supply-total-ok" : "supply-total-warn"}>
                {reached
                  ? `ถึงยอดขั้นต่ำ ${baht(minimum)} บาทแล้ว สั่งได้เลย`
                  : `ยังขาดอีก ${baht(short)} บาทถึงจะสั่งได้ — ของในระบบมีไม่พอจะดันยอด ต้องเลือกของนอกรายการเพิ่มเอง`}
              </p>
            ) : null}
            <p className="detail-hint">
              ต้องสั่งจริง ≈ {baht(mustTotal)} บาท
              {suggested.length > 0 ? ` · เสนอให้หยิบเพิ่ม ≈ ${baht(plan?.suggestedTotal ?? 0)} บาท` : ""}
              {result?.missingCostCount
                ? ` · มี ${result.missingCostCount} รายการที่ยังไม่ได้ใส่ต้นทุนใน StoreHub ยอดจริงจะสูงกว่านี้`
                : ""}
            </p>
          </div>

          <div className="supply-alert-head">
            <strong>ยังไงก็ต้องสั่ง {must.length} รายการ</strong>
            <small>ถึงหรือต่ำกว่าจุดสั่งซื้อแล้ว</small>
          </div>
          <ul className="supply-alert-list">
            {must.map((item) => (
              <SupplyRow key={`must-${item.productId ?? item.name}`} item={item} />
            ))}
          </ul>

          {suggested.length > 0 ? (
            <>
              <div className="supply-alert-head suggest">
                <strong>เสนอให้หยิบเพิ่ม {suggested.length} รายการ</strong>
                <small>เติมของที่ใกล้พร่อง + ของขายดี ให้บิลถึงขั้นต่ำ ไม่ใช่ซื้อของจม</small>
              </div>
              <ul className="supply-alert-list">
                {suggested.map((item) => (
                  <SupplyRow key={`add-${item.productId ?? item.name}`} item={item} showNote />
                ))}
              </ul>
            </>
          ) : null}

          {guessedPriceCount > 0 ? (
            <p className="detail-hint">* ประมาณจากราคาขาย เพราะยังไม่ได้ใส่ต้นทุนไว้ใน StoreHub</p>
          ) : null}
          <div className="supply-alert-actions">
            <SuppliesCopyButton text={copyText} />
            <a href={storeHubSupplyNeedsUrl} target="_blank" rel="noreferrer" className="supply-alert-button ghost">
              เปิดใน StoreHub
            </a>
          </div>
        </section>
      ) : null}

      {result?.trackedCount ? (
        <p className="detail-hint">
          ระบบดูให้เฉพาะสินค้าที่ตั้ง &quot;จุดสั่งซื้อ&quot; ไว้ใน StoreHub ตอนนี้มี {result.trackedCount} รายการ —
          ของที่ยังไม่ได้ตั้งจะไม่ขึ้นเตือนและเอามาดันยอดไม่ได้ ตั้งเพิ่มได้ที่หน้าสินค้าใน StoreHub
        </p>
      ) : null}
    </main>
  );
}
