import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { KPI_STATUS_SHORT, KPI_STATUS_TONE, formatKpiValue, seriesByBranch, sparklinePoints, type KpiPoint, type KpiStatus } from "../../lib/masterplan-kpi.ts";

// Small server-safe pieces for the ตัวชี้วัด pages: the status chip (icon + text + tone, so
// it never relies on color alone) and the inline sparkline + table for a KPI's series.

const ICONS = { yes: CircleCheck, hold: CircleDashed, no: CircleX } as const;

export function KpiStatusChip({ status, short = false }: { status: KpiStatus; short?: boolean }) {
  const tone = KPI_STATUS_TONE[status] ?? "no";
  const Icon = ICONS[tone];
  return (
    <span className={`mp-status mp-kstatus is-${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {short ? KPI_STATUS_SHORT[status] : status}
    </span>
  );
}

function Sparkline({ points, label }: { points: KpiPoint[]; label: string }) {
  const width = 160;
  const height = 40;
  const xy = sparklinePoints(
    points.map((p) => p.value),
    width,
    height
  );
  if (xy.length < 2) return null;
  const last = xy[xy.length - 1];
  return (
    <svg className="mp-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <polyline points={xy.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="3" fill="currentColor" />
    </svg>
  );
}

export function KpiSeries({ series, unit }: { series: KpiPoint[]; unit: string }) {
  const groups = seriesByBranch(series);
  return (
    <div className="mp-kseries">
      {groups.map(({ branch, points }) => {
        const first = points[0];
        const last = points[points.length - 1];
        const label = `${branch || "รวม"}: จาก ${formatKpiValue(first.value, unit)} (${first.period}) เป็น ${formatKpiValue(last.value, unit)} (${last.period}) · ${points.length} จุด`;
        return (
          <div key={branch || "all"} className="mp-kseries__group">
            <p className="mp-kseries__head">
              <span>{branch || "รวมทุกสาขา"}</span>
              <Sparkline points={points} label={label} />
            </p>
            <div className="mp-table-wrap" tabIndex={0} role="region" aria-label={`ข้อมูลย้อนหลัง ${branch || "รวม"}`}>
              <table className="mp-ktable">
                <thead>
                  <tr>
                    <th scope="col">ช่วง</th>
                    <th scope="col">ค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={`${p.period}-${i}`}>
                      <td>{p.period}</td>
                      <td>{formatKpiValue(p.value, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
