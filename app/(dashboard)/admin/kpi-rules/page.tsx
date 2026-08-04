import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { fetchKpiRules, resetKpiRulesOverride, saveKpiRulesOverride } from "../../../../lib/kpi-rules-store.ts";
import { defaultKpiRules, kpiRuleRows, overrideFromRows } from "../../../../lib/kpi-rules.ts";

// The live rulebook: how a score is added up today, and the numbers behind it. Everyone on
// the admin side can read it — the point is that the rules are not buried in code — but
// only an owner can retune them, because every number here ends in a salary figure.

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

function back(status: string) {
  redirect(`/admin/kpi-rules?status=${status}`);
}

async function saveAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) back("denied");

  const entries = [...formData.entries()]
    .filter(([key]) => key.startsWith("rule:"))
    .map(([key, value]) => ({ path: key.slice("rule:".length), value: Number(String(value)) }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0);

  try {
    await saveKpiRulesOverride(overrideFromRows(entries), user.actualEmail);
  } catch {
    back("error");
  }

  revalidatePath("/admin/kpi-rules");
  revalidatePath("/admin/performance-score");
  revalidatePath("/my-view");
  back("saved");
}

async function resetAction() {
  "use server";
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) back("denied");

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
  saved: { tone: "success", text: "บันทึกกติกาแล้ว — คะแนนทุกคนคิดใหม่ตามนี้ทันที" },
  reset: { tone: "success", text: "คืนค่าเริ่มต้นแล้ว" },
  denied: { tone: "warning", text: "แก้กติกาได้เฉพาะเจ้าของ และต้องไม่อยู่ในโหมดดูแทนพนักงาน" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ" }
};

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
            {canEdit ? " · แก้ตัวเลขได้ตรงนี้ มีผลกับรอบที่กำลังคิดอยู่ทันที" : " · ดูได้อย่างเดียว (แก้ได้เฉพาะเจ้าของ)"}
          </p>
        </div>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <section className="kpi-rules__flow soft-card">
        <h3>คะแนนหนึ่งคนคิดยังไง</h3>
        <ol>
          <li>ทุกหมวดเริ่มที่ {rules.categoryMax} คะแนน — เข้างาน · Stock · Checklist · บริการลูกค้า · งานที่มอบหมาย</li>
          <li>หักตามตารางข้างล่างจากเหตุการณ์จริง (ตารางกะ + clock-in StoreHub, การนับ stock, checklist ที่ส่ง, เคสลูกค้า, งานที่มอบหมาย)</li>
          <li>บวก/ลบด้วยการแก้คะแนนเองของเจ้าของ (มีเหตุผลกำกับทุกครั้ง) ที่หน้าคะแนนพนักงาน</li>
          <li>รวม 5 หมวด → ตัดที่ 0–{rules.categoryMax * 5} → ได้ระดับ incentive</li>
          <li>ถ้าคะแนนรวมต่ำกว่า {rules.salary.threshold} → หักเงินตามเรตด้านล่าง</li>
        </ol>
      </section>

      <form action={saveAction} className="kpi-rules">
        {groups.map((group) => (
          <section key={group} className="kpi-rules__group soft-card">
            <h3>{group}</h3>
            <div className="kpi-rules__rows">
              {rows.filter((row) => row.category === group).map((row) => {
                const fallback = defaults.get(row.path);
                const changed = fallback !== undefined && fallback !== row.value;
                return (
                  <div key={row.path} className="kpi-rules__row">
                    <div>
                      <strong>{row.label}</strong>
                      {row.note ? <small>{row.note}</small> : null}
                      {changed ? <small className="kpi-rules__changed">ค่าเริ่มต้น {fallback}</small> : null}
                    </div>
                    <label>
                      <input
                        type="number"
                        name={`rule:${row.path}`}
                        defaultValue={row.value}
                        step="1"
                        min="0"
                        disabled={!canEdit}
                      />
                      <span>{row.unit}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

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
          <div className="checklist-config__bar">
            <button type="submit" className="primary-action">บันทึกกติกา</button>
            <button type="submit" formAction={resetAction} className="kpi-rules__reset">คืนค่าเริ่มต้นทั้งหมด</button>
          </div>
        ) : null}
      </form>
    </main>
  );
}
