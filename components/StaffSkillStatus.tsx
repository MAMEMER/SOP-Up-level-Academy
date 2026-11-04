import Link from "next/link";
import { radarPoint, radarPolygon, skillLevelLabels, type SkillStatusGroup, buildSkillStatus } from "../lib/skill-status.ts";

// สเตตัส Hard / Soft skill ของพนักงานหนึ่งคน: กราฟเรดาร์ + แถบระดับรายตัวชี้วัด.
// ระดับมาจากที่แอดมินยืนยันใน /admin/skill-review เท่านั้น.

const W = 440;
const H = 350;
const CX = W / 2;
const CY = 178;
const R = 122;

const groupMeta = {
  hard: { title: "Hard skill", tone: "hard" },
  soft: { title: "Soft skill", tone: "soft" }
} as const;

function labelAnchor(x: number): "start" | "middle" | "end" {
  if (Math.abs(x - CX) < 8) return "middle";
  return x > CX ? "start" : "end";
}

function SkillRadar({ group }: { group: SkillStatusGroup }) {
  const count = group.items.length;
  const rings = Array.from({ length: group.maxLevel }, (_, index) => index + 1);
  const ringPoints = (level: number) =>
    radarPolygon(group.items.map(() => level), group.maxLevel, R, CX, CY);
  return (
    <svg className="skill-status__radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`กราฟ ${groupMeta[group.group].title}`}>
      {rings.map((level) => (
        <polygon key={level} points={ringPoints(level)} className="skill-status__ring" />
      ))}
      {group.items.map((item, index) => {
        const end = radarPoint(index, count, R, CX, CY);
        return <line key={item.id} x1={CX} y1={CY} x2={end.x} y2={end.y} className="skill-status__axis" />;
      })}
      {rings.map((level) => {
        // ตัวเลขระดับวางกลางระหว่างแกนแรกกับแกนที่สอง ไม่ให้ทับจุดคะแนน
        const point = radarPoint(0.5, count, (level / group.maxLevel) * R * 0.9, CX, CY);
        return (
          <text key={level} x={point.x} y={point.y + 4} textAnchor="middle" className="skill-status__tick">
            {level}
          </text>
        );
      })}
      <polygon points={radarPolygon(group.items.map((item) => item.level), group.maxLevel, R, CX, CY)} className="skill-status__area" />
      {group.items.map((item, index) => {
        const point = radarPoint(index, count, (item.level / group.maxLevel) * R, CX, CY);
        return <circle key={item.id} cx={point.x} cy={point.y} r={4.5} className="skill-status__dot" />;
      })}
      {group.items.map((item, index) => {
        const point = radarPoint(index, count, R + 14, CX, CY);
        const dy = point.y < CY - R * 0.6 ? -2 : point.y > CY + R * 0.6 ? 12 : 4;
        return (
          <text key={item.id} x={point.x} y={point.y + dy} textAnchor={labelAnchor(point.x)} className="skill-status__label">
            {item.shortName}
          </text>
        );
      })}
    </svg>
  );
}

function SkillGroupPanel({ group }: { group: SkillStatusGroup }) {
  const meta = groupMeta[group.group];
  return (
    <section className={`skill-status__group skill-status__group--${meta.tone}`}>
      <header className="skill-status__head">
        <h4>
          {meta.title} <small>{group.items.length} ตัวชี้วัด</small>
        </h4>
        <span className="skill-status__avg">
          เฉลี่ย <strong>{group.average.toFixed(1)}</strong> / {group.maxLevel}
        </span>
      </header>
      <SkillRadar group={group} />
      <ol className="skill-status__bars">
        {group.items.map((item) => (
          <li key={item.id}>
            <strong className="skill-status__level">{item.level}</strong>
            <span className="skill-status__name">{item.name}</span>
            <span className="skill-status__meter" aria-label={`ระดับ ${item.level} จาก ${group.maxLevel}`}>
              {Array.from({ length: group.maxLevel }, (_, index) => (
                <i key={index} className={index < item.level ? "is-on" : undefined} />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function StaffSkillStatus({ staffCode, status }: { staffCode: string; status: ReturnType<typeof buildSkillStatus> }) {
  return (
    <div className="skill-status">
      {status.hasData ? null : (
        <p className="skill-status__empty">
          ยังไม่ได้ประเมิน ทุกตัวชี้วัดอยู่ที่ระดับเริ่มต้น 1 — <Link href={`/admin/skill-review?staff=${encodeURIComponent(staffCode)}`}>ไปประเมิน skill</Link>
        </p>
      )}
      <div className="skill-status__grid">
        <SkillGroupPanel group={status.hard} />
        <SkillGroupPanel group={status.soft} />
      </div>
      <p className="skill-status__legend">
        {skillLevelLabels.map((entry) => (
          <span key={entry.level}>
            <strong>{entry.level}</strong> {entry.label}
          </span>
        ))}
        <span>· ทุกคนเริ่มที่ระดับ 1 · Soft skill สูงสุดระดับ 3</span>
      </p>
    </div>
  );
}
