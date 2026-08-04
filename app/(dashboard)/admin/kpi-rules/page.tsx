import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import {
  deleteCustomKpiRule,
  fetchKpiRules,
  patchKpiRule,
  resetKpiRulesOverride,
  saveCustomKpiRule
} from "../../../../lib/kpi-rules-store.ts";
import { defaultKpiRules, kpiRuleRows, type KpiCustomRule } from "../../../../lib/kpi-rules.ts";
import { adjustmentCategoryOptions } from "../../../../lib/score-adjustments.ts";

// The live rulebook: how a score is added up today, and the numbers behind it. Everyone on
// the admin side can read it — the point is that the rules are not buried in code — but
// only an owner can retune them, because every number here ends in a salary figure.
//
// Rates save one row at a time: an owner fixing a single number should never republish
// values that changed in between. Rules the owner writes themselves ("ข้อที่เพิ่มเอง") are
// charged by hand from the score page — a rule that scores itself needs a data source, and
// that is code.

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

function back(status: string) {
  redirect(`/admin/kpi-rules?status=${status}`);
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function requireOwner(status = "denied") {
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) back(status);
  return user;
}

async function saveRuleAction(formData: FormData) {
  "use server";
  const user = await requireOwner();
  const path = stringValue(formData, "path");
  const value = Number(stringValue(formData, "value"));
  if (!path || !Number.isFinite(value) || value < 0) back("bad-value");

  try {
    await patchKpiRule(path, value, user.actualEmail);
  } catch {
    back("error");
  }

  revalidatePath("/admin/kpi-rules");
  revalidatePath("/admin/performance-score");
  revalidatePath("/my-view");
  back("saved");
}

async function saveCustomRuleAction(formData: FormData) {
  "use server";
  const user = await requireOwner();
  const label = stringValue(formData, "label");
  const points = Number(stringValue(formData, "points"));
  if (!label) back("custom-missing-label");
  if (!Number.isFinite(points) || Math.round(points) === 0) back("custom-missing-points");

  const existingId = stringValue(formData, "id");
  const rule: KpiCustomRule = {
    id: existingId || `custom-${label}`.replace(/[^a-zA-Z0-9ก-๙-]/g, "-").toLowerCase(),
    label,
    category: (adjustmentCategoryOptions.find((option) => option.value === stringValue(formData, "category"))?.value) || "checklist",
    points: Math.round(points),
    note: stringValue(formData, "note") || undefined
  };

  try {
    await saveCustomKpiRule(rule, user.actualEmail);
  } catch {
    back("error");
  }

  revalidatePath("/admin/kpi-rules");
  revalidatePath("/admin/performance-score");
  back("custom-saved");
}

async function deleteCustomRuleAction(formData: FormData) {
  "use server";
  const user = await requireOwner();
  try {
    await deleteCustomKpiRule(stringValue(formData, "id"), user.actualEmail);
  } catch {
    back("error");
  }
  revalidatePath("/admin/kpi-rules");
  revalidatePath("/admin/performance-score");
  back("custom-removed");
}

async function resetAction() {
  "use server";
  const user = await requireOwner();
  try {
    await resetKpiRulesOverride(user.actualEmail);
  } catch {
    back("error");
  }
  revalidatePath("/admin/kpi-rules");
  revalidatePath("/admin/performance-score");
  revalidatePath("/my-view");
  back("reset");
}

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกข้อนี้แล้ว — คะแนนคิดใหม่ตามนี้ทันที" },
  reset: { tone: "success", text: "คืนค่าเริ่มต้นทั้งหมดแล้ว (ข้อที่เพิ่มเองถูกลบด้วย)" },
  "custom-saved": { tone: "success", text: "บันทึกข้อใหม่แล้ว — ใช้หักได้ที่หน้าคะแนนพนักงาน" },
  "custom-removed": { tone: "success", text: "ลบข้อที่เพิ่มเองแล้ว" },
  "custom-missing-label": { tone: "warning", text: "ต้องตั้งชื่อข้อ" },
  "custom-missing-points": { tone: "warning", text: "ใส่จำนวนคะแนน (+ หัก / − เพิ่มให้) ไม่ใช่ 0" },
  "bad-value": { tone: "warning", text: "ใส่ตัวเลขไม่ติดลบ" },
  denied: { tone: "warning", text: "แก้กติกาได้เฉพาะเจ้าของ และต้องไม่อยู่ในโหมดดูแทนพนักงาน" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ" }
};

const categoryLabel = Object.fromEntries(adjustmentCategoryOptions.map((option) => [option.value, option.label]));

export default async function AdminKpiRulesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const params = searchParams ? await searchParams : {};
  const status = params.status ? statusMessages[params.status] : undefined;
  const rules = await fetchKpiRules();
  const rows = kpiRuleRows(rules);
  const defaults = new Map(kpiRuleRows(defaultKpiRules).map((row) => [row.path, row.value]));
  const canEdit = isOwner(user.actualEmail) && !user.isImpersonating;
  const groups = [...new Set(rows.map((row) => row.category))];

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">KPI rulebook</p>
          <h2>กติกาการให้คะแนนพนักงาน</h2>
          <p>
            คะแนนเต็ม {rules.categoryMax * 5} = 5 หมวด × {rules.categoryMax} คะแนน · แต่ละหมวดเริ่มที่เต็ม
            แล้วหักตามเหตุการณ์ที่เกิดจริง หักได้จนติดลบ · คะแนนรวมถูกบีบไว้ที่ 0–{rules.categoryMax * 5}
            {canEdit ? " · แก้ตัวเลขได้ทีละข้อ กดบันทึกที่ข้อนั้น" : " · ดูได้อย่างเดียว (แก้ได้เฉพาะเจ้าของ)"}
          </p>
        </div>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <section className="kpi-rules__flow soft-card">
        <h3>คะแนนหนึ่งคนคิดยังไง</h3>
        <ol>
          <li>ทุกหมวดเริ่มที่ {rules.categoryMax} คะแนน — เข้างาน · Stock · Checklist · บริการลูกค้า · งานที่มอบหมาย</li>
          <li>หักตามตารางข้างล่างจากเหตุการณ์จริง (ตารางกะ + clock-in StoreHub, การนับ stock, checklist ที่ส่ง, เคสลูกค้า, งานที่มอบหมาย)</li>
          <li>บวก/ลบด้วยการแก้คะแนนเองของเจ้าของ และข้อที่เพิ่มเอง (มีเหตุผลกำกับทุกครั้ง) ที่หน้าคะแนนพนักงาน</li>
          <li>รวม 5 หมวด → ตัดที่ 0–{rules.categoryMax * 5} → ได้ระดับ incentive</li>
          <li>ถ้าคะแนนรวมต่ำกว่า {rules.salary.threshold} → หักเงินตามเรตด้านล่าง</li>
        </ol>
      </section>

      <div className="kpi-rules">
        {groups.map((group) => (
          <section key={group} className="kpi-rules__group soft-card">
            <h3>{group}</h3>
            <div className="kpi-rules__rows">
              {rows.filter((row) => row.category === group).map((row) => {
                const fallback = defaults.get(row.path);
                const changed = fallback !== undefined && fallback !== row.value;
                return (
                  <form key={row.path} action={saveRuleAction} className="kpi-rules__row">
                    <input type="hidden" name="path" value={row.path} />
                    <div>
                      <strong>{row.label}</strong>
                      {row.note ? <small>{row.note}</small> : null}
                      {changed ? <small className="kpi-rules__changed">ค่าเริ่มต้น {fallback}</small> : null}
                    </div>
                    <label>
                      <input type="number" name="value" defaultValue={row.value} step="1" min="0" disabled={!canEdit} />
                      <span>{row.unit}</span>
                      {canEdit ? <button type="submit">บันทึก</button> : null}
                    </label>
                  </form>
                );
              })}
            </div>
          </section>
        ))}

        <section className="kpi-rules__group soft-card">
          <h3>ข้อที่เพิ่มเอง</h3>
          <p className="kpi-rules__hint">
            ข้อพวกนี้ระบบไม่ได้จับให้เอง — เจ้าของกดหักที่หน้าคะแนนพนักงานเมื่อเกิดเรื่องขึ้นจริง
            แล้วจะขึ้นในตารางเหตุผลการหักคะแนนพร้อมชื่อข้อ ยกเลิกทีหลังได้
          </p>
          {rules.customRules.length ? (
            <div className="kpi-rules__rows">
              {rules.customRules.map((rule) => (
                <div key={rule.id} className="kpi-rules__row">
                  <div>
                    <strong>{rule.label}</strong>
                    <small>
                      {categoryLabel[rule.category] || rule.category} · {rule.points > 0 ? `หัก ${rule.points}` : `เพิ่มให้ ${Math.abs(rule.points)}`} คะแนน
                      {rule.note ? ` · ${rule.note}` : ""}
                    </small>
                  </div>
                  {canEdit ? (
                    <form action={deleteCustomRuleAction}>
                      <input type="hidden" name="id" value={rule.id} />
                      <button type="submit" className="staff-form__delete">ลบ</button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="kpi-rules__hint">ยังไม่มีข้อที่เพิ่มเอง</p>
          )}

          {canEdit ? (
            <form action={saveCustomRuleAction} className="performance-adjust-form">
              <label className="wide">
                ชื่อข้อ
                <input name="label" placeholder="เช่น ลืมล็อกตู้การ์ดตอนปิดร้าน" required />
              </label>
              <label>
                หมวด
                <select name="category" defaultValue="checklist">
                  {adjustmentCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                คะแนน (+ หัก / − เพิ่มให้)
                <input name="points" type="number" step="1" defaultValue="2" />
              </label>
              <label className="wide">
                หมายเหตุ (ไม่บังคับ)
                <input name="note" placeholder="เงื่อนไข / ตัวอย่างที่เข้าข่าย" />
              </label>
              <button type="submit">เพิ่มข้อนี้</button>
            </form>
          ) : null}
        </section>

        <section className="kpi-rules__group soft-card">
          <h3>Incentive</h3>
          <div className="kpi-rules__rows">
            {rules.incentive.tiers.map((tier) => (
              <div key={tier.label} className="kpi-rules__row">
                <div><strong>คะแนน {tier.label}</strong>{tier.percent === 0 ? <small>ต้องประเมินรายสัปดาห์ (coach)</small> : null}</div>
                <label>
                  <input type="number" defaultValue={tier.percent} disabled readOnly />
                  <span>% ของ incentive</span>
                </label>
              </div>
            ))}
          </div>
          <p className="kpi-rules__hint">ระดับ incentive ยังแก้ในโค้ด — บอกได้ถ้าจะให้เปิดแก้ตรงนี้ด้วย</p>
        </section>

        {canEdit ? (
          <form action={resetAction} className="checklist-config__bar">
            <button type="submit" className="kpi-rules__reset">คืนค่าเริ่มต้นทั้งหมด</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
