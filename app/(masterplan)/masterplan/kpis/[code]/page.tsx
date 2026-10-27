import { notFound } from "next/navigation";
import { KpiTools } from "../../../../../components/masterplan/KpiEditor.tsx";
import { KpiSeries, KpiStatusChip } from "../../../../../components/masterplan/KpiBits.tsx";
import { KpiSteps } from "../../../../../components/masterplan/KpiSteps.tsx";
import { MpHead } from "../../../../../components/masterplan/MpHead.tsx";
import { memberName } from "../../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../../lib/masterplan-auth.ts";
import { thaiDateTime } from "../../../../../lib/masterplan-format.ts";
import { formatKpiValue } from "../../../../../lib/masterplan-kpi.ts";
import { getKpi } from "../../../../../lib/masterplan-store.ts";

export const dynamic = "force-dynamic";

function sourceLabel(source: string): string {
  if (source === "manual") return "แก้บนเว็บ";
  if (source === "ai-token") return "แก้ผ่าน AI";
  if (source.startsWith("audit-")) return `ตรวจสอบ ${source.slice(6)}`;
  return source;
}

export default async function KpiDetailPage({ params }: { params: Promise<{ code: string }> }) {
  await requireMasterplanMember();
  const { code } = await params;
  const kpi = await getKpi(decodeURIComponent(code));
  if (!kpi) notFound();
  const openSteps = kpi.nextSteps.filter((s) => !s.done).length;

  return (
    <>
      <MpHead
        eyebrow={`Mission ${kpi.mission} · ${kpi.dimension}`}
        title={kpi.name}
        sub={
          <>
            <span className="mp-code">{kpi.code}</span> · ระดับ{kpi.tier} · {kpi.direction}
            {kpi.unit ? ` · หน่วย ${kpi.unit}` : ""} · ความมั่นใจ{kpi.confidence}
          </>
        }
        back={{ href: "/masterplan/kpis", label: "ตัวชี้วัดทั้งหมด" }}
      />

      <div className="mp-kstate">
        <KpiStatusChip status={kpi.status} />
        <span className="mp-meta">เป้า: {kpi.target ? `${formatKpiValue(kpi.target.value, kpi.unit)} · ${kpi.target.period}` : "รอตั้งผ่านข้อเสนอ"}</span>
      </div>
      <KpiTools kpi={kpi} />

      <div className="mp-kdetail">
        <div className="mp-kdetail__col">
          <section className="mp-block">
            <h2 className="mp-h2">นิยาม</h2>
            {kpi.definition ? <p className="mp-kprose">{kpi.definition}</p> : <p className="mp-empty">ยังไม่มีนิยาม</p>}
          </section>

          <section className="mp-block">
            <h2 className="mp-h2">ค่าฐาน</h2>
            {kpi.baseline ? (
              <div className="mp-kbase">
                <p className="mp-kbase__value">{formatKpiValue(kpi.baseline.value, kpi.unit)}</p>
                <p className="mp-meta">
                  {kpi.baseline.period}
                  {kpi.baseline.branch ? ` · ${kpi.baseline.branch}` : " · รวมทุกสาขา"}
                  {kpi.baseline.n !== undefined ? ` · n = ${kpi.baseline.n.toLocaleString("th-TH")}` : ""}
                </p>
                <p className="mp-kprose">
                  <span className="mp-klabel">วิธีวัด</span>
                  {kpi.baseline.method}
                </p>
              </div>
            ) : (
              <p className="mp-empty">— ยังไม่มีค่าฐาน</p>
            )}
          </section>

          {kpi.series && kpi.series.length > 0 ? (
            <section className="mp-block">
              <h2 className="mp-h2">ข้อมูลย้อนหลัง</h2>
              <KpiSeries series={kpi.series} unit={kpi.unit} />
            </section>
          ) : null}

          <section className="mp-block">
            <h2 className="mp-h2">แหล่งข้อมูล</h2>
            {kpi.dataSources.length === 0 ? (
              <p className="mp-empty">ยังไม่ระบุแหล่งข้อมูล</p>
            ) : (
              <ul className="mp-ksources">
                {kpi.dataSources.map((s, i) => (
                  <li key={`${s.system}-${i}`}>
                    <p className="mp-ksources__system">{s.system}</p>
                    {s.fields ? <p className="mp-meta">ช่องข้อมูล: {s.fields}</p> : null}
                    {s.coverage ? <p className="mp-meta">ครอบคลุม: {s.coverage}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mp-kdetail__col">
          <section className="mp-block">
            <h2 className="mp-h2">ช่องว่าง</h2>
            {kpi.gaps.length === 0 ? (
              <p className="mp-empty">ไม่มีช่องว่างที่บันทึกไว้</p>
            ) : (
              <ul className="mp-kgaps">
                {kpi.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="mp-block">
            <h2 className="mp-h2">
              สิ่งที่ต้องทำต่อ <span className="mp-count">{openSteps}</span>
            </h2>
            <KpiSteps items={kpi.nextSteps.map((step) => ({ code: kpi.code, step }))} />
          </section>
        </div>
      </div>

      <p className="mp-meta mp-kupdated">
        อัปเดตล่าสุด {thaiDateTime(kpi.updatedAt)} · {memberName(kpi.updatedBy)} · {sourceLabel(kpi.source)}
        {kpi.viaLabel ? ` (${kpi.viaLabel})` : ""}
      </p>
    </>
  );
}
