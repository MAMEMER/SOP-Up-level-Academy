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

// หน้า "ของที่ต้องสั่ง" — ดึงสดจาก StoreHub (คงเหลือ vs จุดสั่งซื้อ) แล้วบอกให้ชัดว่า
// ต้องสั่งอะไร กี่ชิ้น เป็นเงินเท่าไร และยอดถึงขั้นต่ำของ Makro (100 บาท) หรือยัง.
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

function SupplyRow({ item }: { item: SupplyNeedItem }) {
  const qty = item.orderQty ?? 0;
  return (
    <li className="supply-row">
      <div className="supply-row-main">
        <span className="supply-alert-name">{item.name}</span>
        <small>
          เหลือ {item.remaining}
          {item.reorderPoint ? ` · จุดสั่งซื้อ ${item.reorderPoint}` : ""}
          {item.category ? ` · ${item.category}` : ""}
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

  const needs = result?.items ?? [];
  const watch = result?.watch ?? [];
  const total = result?.estimatedTotal ?? 0;
  const minimum = result?.minOrderValue ?? config.supplyMinOrderValue ?? 0;
  const short = result?.shortOfMinimum ?? 0;
  const copyText = needs.map(orderLine).join("\n");
  const guessedPriceCount = needs.filter((item) => item.costSource === "price").length;

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
            ดึงสดจากสต๊อก StoreHub ของ {config.displayName} — ของที่คงเหลือถึงหรือต่ำกว่าจุดสั่งซื้อ พร้อมจำนวนที่ต้องสั่งและมูลค่าโดยประมาณ
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

      {result && needs.length === 0 ? (
        <section className="supply-panel">
          <p className="detail-hint">ตอนนี้ไม่มีของที่ถึงจุดสั่งซื้อ — ยังไม่ต้องสั่งอะไร</p>
        </section>
      ) : null}

      {needs.length > 0 ? (
        <section className="supply-panel">
          <div className="supply-total">
            <div>
              <strong>ต้องสั่ง {needs.length} รายการ</strong>
              <span className="supply-total-amount">≈ {baht(total)} บาท</span>
            </div>
            {minimum > 0 ? (
              <p className={short > 0 ? "supply-total-warn" : "supply-total-ok"}>
                {short > 0
                  ? `ยอดขั้นต่ำ Makro ${baht(minimum)} บาท — ยังขาดอีก ${baht(short)} บาท ต้องสั่งของเพิ่มหรือรอรอบหน้า`
                  : `ถึงยอดขั้นต่ำ Makro ${baht(minimum)} บาทแล้ว สั่งได้เลย`}
              </p>
            ) : null}
            {result?.missingCostCount ? (
              <p className="detail-hint">
                มี {result.missingCostCount} รายการที่ยังไม่ได้ใส่ต้นทุนใน StoreHub — ยอดจริงจะสูงกว่านี้
              </p>
            ) : null}
          </div>
          <ul className="supply-alert-list">
            {needs.map((item) => (
              <SupplyRow key={`${item.name}-${item.reorderPoint ?? 0}`} item={item} />
            ))}
          </ul>
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

      {watch.length > 0 ? (
        <section className="supply-panel">
          <div className="supply-alert-head">
            <strong>ใกล้ถึงจุดสั่งซื้อ {watch.length} รายการ</strong>
            <small>ยังไม่ต้องสั่งวันนี้ แต่ถ้าสั่งรอบนี้อยู่แล้วก็หยิบไปด้วยได้</small>
          </div>
          <ul className="supply-alert-list">
            {watch.map((item) => (
              <SupplyRow key={`${item.name}-${item.reorderPoint ?? 0}`} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {result?.trackedCount ? (
        <p className="detail-hint">
          ระบบดูให้เฉพาะสินค้าที่ตั้ง &quot;จุดสั่งซื้อ&quot; ไว้ใน StoreHub ตอนนี้มี {result.trackedCount} รายการ —
          ของที่ยังไม่ได้ตั้งจะไม่ขึ้นเตือน ตั้งเพิ่มได้ที่หน้าสินค้าใน StoreHub
        </p>
      ) : null}
    </main>
  );
}
