import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { sopTaskCodes } from "../../../lib/mistake-log.ts";
import { careerStages, skillIndicators, type CareerStage } from "../../../lib/skill-indicators.ts";
import { skillLevels } from "../../../components/SkillReviewGuide.tsx";

export const dynamic = "force-dynamic";

export default async function WorkGuidePage() {
  const user = await requireUser();
  const staff = (await listStaff()).find((person) => person.email.toLowerCase() === user.email.toLowerCase());
  const stageByPosition: Record<string, CareerStage> = { temporary: "parttime", regular: "regular", branch_manager: "manager" };
  const stage = staff?.position ? stageByPosition[staff.position] : undefined;
  const groups = [{ id: "1.1", label: "หน้าร้าน" }, { id: "2.1", label: "หลังร้าน" }];

  return <main className="page skill-review peer-review work-guide">
    <Link href="/my-view" className="back-link">← กลับหน้างานของฉัน</Link>
    <section className="board-hero"><div><p className="eyebrow">เตรียมพร้อมก่อนประเมิน</p><h2>คู่มืองานของฉัน</h2><p>ดูงานที่ต้องทำและเกณฑ์สกิลที่ใช้ในการประเมิน</p></div></section>
    <section className="owner-ops__panel">
      <h3>งานพื้นฐาน</h3>
      <p>สอนครั้งเดียว ทำให้ดู 3 ครั้งถูกหมด = ผ่าน · หลังผ่าน เริ่ม 100 ผิดถึงหัก · ต่ำกว่า 90 ไม่มีสิทธิ์ incentive</p>
      {groups.map((group, index) => <details className="work-guide__group" key={group.id} open={index === 0}>
        <summary>{group.label} {group.id}</summary>
        <ul className="peer-review__mine">{sopTaskCodes.filter((task) => task.group === group.id).map((task) => <li key={task.code}><span>{task.code}</span><span>{task.name}</span></li>)}</ul>
      </details>)}
    </section>
    <section className="owner-ops__panel">
      <h3>งานขั้นสูง (สกิล)</h3>
      <p>สอบความรู้ผ่านอย่างน้อย 80% สอบซ้ำได้หลัง 7 วัน · ประเมินผลการทำงานทุกสัปดาห์</p>
      <div className="work-guide__levels">{skillLevels.map((level) => <div key={level.level}><h4>ระดับ {level.level} {level.name}</h4><p><strong>ขึ้นได้เมื่อ:</strong> {level.how.replace(/ \(Soft skill:.*\)$/, "")}</p></div>)}</div>
      {!stage && <p>ยังไม่ระบุตำแหน่ง จึงแสดงเกณฑ์ทุกตำแหน่ง</p>}
      <div className="work-guide__skills">{skillIndicators.filter((skill) => skill.group === "hard").map((skill) => <article key={skill.id}>
        <h4>{skill.name} {skill.highRisk && <span className="skill-review__risk">เสี่ยงสูง</span>}</h4>
        {stage ? <p><strong>{skill.required[stage] === 0 ? "ตำแหน่งของคุณยังไม่กำหนดระดับขั้นต่ำ" : `ตำแหน่งของคุณต้องถึงระดับ ${skill.required[stage]}`}</strong></p> : <p><strong>ระดับที่ต้องถึง:</strong> {careerStages.map((item) => `${item.label} ${skill.required[item.id] || "ยังไม่กำหนด"}`).join(" · ")}</p>}
        <p><strong>ระดับ 2:</strong> {skill.criteria.l2}</p><p><strong>ระดับ 3:</strong> {skill.criteria.l3}</p><p><strong>หลักฐาน:</strong> {skill.evidence}</p>
      </article>)}</div>
    </section>
    <section className="owner-ops__panel"><Link href="/training">ขั้นตอนทำงานละเอียด ดูที่คู่มือหน้างาน →</Link></section>
  </main>;
}
