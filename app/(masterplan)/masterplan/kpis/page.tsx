import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { KpiStatusChip } from "../../../../components/masterplan/KpiBits.tsx";
import { KpiSteps } from "../../../../components/masterplan/KpiSteps.tsx";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { listKpis } from "../../../../lib/masterplan-store.ts";
import {
  KPI_MISSIONS,
  KPI_STATUSES,
  KPI_STATUS_SHORT,
  KPI_STATUS_TONE,
  KPI_TIERS,
  allWho,
  countsByMission,
  formatKpiValue,
  groupKpis,
  isKpiMission,
  isKpiStatus,
  isKpiTier,
  openStepsByWho,
  type MpKpi
} from "../../../../lib/masterplan-kpi.ts";

// ตัวชี้วัด — every KPI's measurement status, grouped Mission → มิติ. Filters live in the URL
// (shareable, back-button friendly). Tab "สิ่งที่ต้องทำต่อ" gathers all open next steps by who.

export const dynamic = "force-dynamic";

type Search = { tab?: string; mission?: string; status?: string; tier?: string; who?: string };

function href(current: Search, patch: Search): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const query = params.toString();
  return `/masterplan/kpis${query ? `?${query}` : ""}`;
}

function BaselineText({ kpi }: { kpi: MpKpi }) {
  if (!kpi.baseline) return <span className="mp-krow-line__base is-none">ค่าฐาน —</span>;
  return (
    <span className="mp-krow-line__base">
      <strong>{formatKpiValue(kpi.baseline.value, kpi.unit)}</strong> · {kpi.baseline.period}
    </span>
  );
}

export default async function KpisPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireMasterplanMember();
  const search = await searchParams;
  const kpis = await listKpis();
  const tab = search.tab === "steps" ? "steps" : "";
  const mission = isKpiMission(search.mission) ? search.mission : "";
  const status = isKpiStatus(search.status) ? search.status : "";
  const tier = isKpiTier(search.tier) ? search.tier : "";
  const whoList = allWho(kpis);
  const who = search.who && whoList.includes(search.who) ? search.who : "";
  const current: Search = { tab, mission, status, tier, who };

  const filtered = kpis.filter(
    (k) =>
      (!mission || k.mission === mission) &&
      (!status || k.status === status) &&
      (!tier || k.tier === tier) &&
      (!who || k.nextSteps.some((s) => s.who.trim() === who && (tab !== "steps" || !s.done)))
  );
  const summary = countsByMission(kpis);
  const stepGroups = openStepsByWho(filtered).filter((g) => !who || g.who === who);
  const openTotal = openStepsByWho(kpis).reduce((sum, g) => sum + g.steps.length, 0);

  return (
    <>
      <MpHead eyebrow="ตัวชี้วัด" title="สถานะการวัดตัวชี้วัด" sub="ตัวชี้วัดแต่ละตัววัดได้แล้วหรือยัง ค่าฐานเท่าไร และต้องทำอะไรต่อ เป้าหมายตั้งผ่านข้อเสนอเท่านั้น" />

      {kpis.length === 0 ? (
        <p className="mp-empty">ยังไม่มีตัวชี้วัด — ผู้แก้ฉบับกลางนำเข้าได้ที่หน้า <Link href="/masterplan/import">นำเข้า</Link></p>
      ) : (
        <>
          {!tab ? (
          <div className="mp-ksum" aria-label="สรุปตาม Mission">
            {summary.map(({ mission: m, counts }) => (
              <div key={m} className="mp-ksum__item">
                <Link href={href({ tab }, { mission: m })} className="mp-ksum__head">
                  <span className="mp-ksum__mission">Mission {m}</span>
                  <span className="mp-ksum__total">{counts.total} ตัว</span>
                </Link>
                <ul className="mp-ksum__counts">
                  {KPI_STATUSES.map((s) => (
                    <li key={s}>
                      <Link href={href({ tab }, { mission: m, status: s })} className={`mp-ksum__count is-${KPI_STATUS_TONE[s]}`}>
                        <span className="mp-ksum__num">{counts[s]}</span>
                        <span className="mp-ksum__label">{KPI_STATUS_SHORT[s]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          ) : null}

          <nav className="mp-tabs mp-ktabs" aria-label="มุมมอง">
            <Link href={href(current, { tab: "" })} className={!tab ? "is-active" : undefined} aria-current={!tab ? "page" : undefined}>
              ตัวชี้วัด <span className="mp-count">{kpis.length}</span>
            </Link>
            <Link href={href(current, { tab: "steps" })} className={tab ? "is-active" : undefined} aria-current={tab ? "page" : undefined}>
              สิ่งที่ต้องทำต่อ <span className="mp-count">{openTotal}</span>
            </Link>
          </nav>

          <div className="mp-filters mp-filters--wrap" aria-label="กรองตัวชี้วัด">
            <div className="mp-filter">
              <span className="mp-filter__label">Mission</span>
              <Link href={href(current, { mission: "" })} className={!mission ? "is-active" : undefined}>
                ทั้งหมด
              </Link>
              {KPI_MISSIONS.map((m) => (
                <Link key={m} href={href(current, { mission: m })} className={mission === m ? "is-active" : undefined}>
                  {m}
                </Link>
              ))}
            </div>
            <div className="mp-filter">
              <span className="mp-filter__label">สถานะ</span>
              <Link href={href(current, { status: "" })} className={!status ? "is-active" : undefined}>
                ทั้งหมด
              </Link>
              {KPI_STATUSES.map((s) => (
                <Link key={s} href={href(current, { status: s })} className={status === s ? "is-active" : undefined}>
                  {s}
                </Link>
              ))}
            </div>
            <div className="mp-filter">
              <span className="mp-filter__label">ระดับ</span>
              <Link href={href(current, { tier: "" })} className={!tier ? "is-active" : undefined}>
                ทั้งหมด
              </Link>
              {KPI_TIERS.map((t) => (
                <Link key={t} href={href(current, { tier: t })} className={tier === t ? "is-active" : undefined}>
                  {t}
                </Link>
              ))}
            </div>
            {whoList.length > 0 ? (
              <div className="mp-filter">
                <span className="mp-filter__label">ใครทำ</span>
                <Link href={href(current, { who: "" })} className={!who ? "is-active" : undefined}>
                  ทุกคน
                </Link>
                {whoList.map((w) => (
                  <Link key={w} href={href(current, { who: w })} className={who === w ? "is-active" : undefined}>
                    {w}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {tab === "steps" ? (
            <>
              <p className="mp-meta">
                {stepGroups.reduce((sum, g) => sum + g.steps.length, 0)} ขั้นที่ยังไม่เสร็จ · ติ๊กเมื่อทำแล้ว หรือกด &ldquo;สร้างเป็นงาน&rdquo; เพื่อส่งเข้าหน้างาน
              </p>
              {stepGroups.length === 0 ? <p className="mp-empty">ไม่มีสิ่งที่ต้องทำต่อตามตัวกรองนี้</p> : null}
              {stepGroups.map((group) => (
                <section key={group.who} className="mp-taskgroup" aria-label={group.who}>
                  <h2 className="mp-taskgroup__head">
                    {group.who} <span className="mp-count">{group.steps.length}</span>
                  </h2>
                  <KpiSteps showKpi hideWho items={group.steps.map((s) => ({ code: s.code, name: s.name, step: s.step }))} />
                </section>
              ))}
            </>
          ) : (
            <>
              <p className="mp-meta">
                แสดง {filtered.length} จาก {kpis.length} ตัวชี้วัด
              </p>
              {filtered.length === 0 ? <p className="mp-empty">ไม่มีตัวชี้วัดตามตัวกรองนี้</p> : null}
              {groupKpis(filtered).map((group) => (
                <section key={group.mission} className="mp-kgroup" aria-label={`Mission ${group.mission}`}>
                  <h2 className="mp-h2">Mission {group.mission}</h2>
                  {group.dimensions.map((dim) => (
                    <div key={dim.dimension} className="mp-kdim">
                      <h3 className="mp-kdim__head">{dim.dimension}</h3>
                      <ul className="mp-klist">
                        {dim.items.map((kpi) => (
                          <li key={kpi.code}>
                            <Link href={`/masterplan/kpis/${encodeURIComponent(kpi.code)}`} className="mp-krow-line">
                              <span className="mp-code">{kpi.code}</span>
                              <span className="mp-krow-line__name" title={kpi.name}>
                                {kpi.name}
                              </span>
                              <KpiStatusChip status={kpi.status} short />
                              <BaselineText kpi={kpi} />
                              <ChevronRight className="mp-krow-line__chev" size={18} aria-hidden="true" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
