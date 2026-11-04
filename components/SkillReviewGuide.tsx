import { careerStages, skillIndicators } from "../lib/skill-indicators.ts";

// แท็บ "คู่มือประเมิน" ใน /admin/skill-review — เนื้อหาจาก "คู่มือประเมิน skill" (เนม 4 พ.ย. 2569) ปรับเป็นประเมินทุก 2 สัปดาห์.
// เกณฑ์รายตัวชี้วัดอ่านจาก lib/skill-indicators.ts ชุดเดียวกับฟอร์มลงผล จะได้ไม่คลาดกัน.

const weeklySteps = [
  {
    title: "ประเมินทุก 2 สัปดาห์",
    text: "1 รอบ = 2 สัปดาห์ (จันทร์–อาทิตย์ × 2) · ประเมินวันจันทร์หลังจบรอบ ลงผลภายใน 3 วัน · ผู้ลงผล: เนม · แชมป์"
  },
  {
    title: "ลงผลครบ 15 ตัว",
    text: "ทุกตัวชี้วัดใส่ผล 1 อย่างจาก 4 แบบด้านล่าง พร้อมหลักฐาน 1 บรรทัด + จำนวนวันทำงานของคนนั้นในรอบ"
  },
  { title: "คุยกับพนักงาน", text: "คุยสั้น 10 นาทีต่อคนต่อรอบ บอกว่ารอบหน้าต้องทำอะไรเพิ่ม" },
  { title: "นับสะสม", text: "ระบบนับจำนวนรอบที่ผ่าน เมื่อครบตามเกณฑ์ = เสนอขึ้นระดับ" }
];

const resultMeanings = [
  { id: "next", label: "ผ่านระดับถัดไป", text: "รอบนี้ทำได้ตามเกณฑ์ของระดับที่กำลังจะขึ้น → นับ 1 รอบ" },
  { id: "hold", label: "คงระดับ", text: "ทำได้ตามระดับที่ถืออยู่ แต่ยังไม่ถึงระดับถัดไป → ไม่นับ ไม่หัก" },
  { id: "below", label: "ต่ำกว่าระดับ", text: "ทำได้ไม่ถึงระดับที่ถืออยู่ → ดูหัวข้อ \"ระดับลดได้\"" },
  { id: "na", label: "ไม่ได้ทำ", text: "รอบนี้ไม่ได้เข้ากะหรือไม่มีงานนั้น → ไม่นับ และไม่ทำให้นับสะสมเริ่มใหม่" }
];

const learnSteps = [
  { title: "เรียน", text: "อ่านคู่มือ ดูผู้ถือระดับ 3 ทำ ฝึกในสถานการณ์จำลอง" },
  { title: "สอบความรู้", text: "เฉพาะ Hard skill ผ่าน ≥ 80% สอบซ้ำได้หลัง 7 วัน" },
  { title: "ทดลองทำ", text: "ทำงานจริงและผ่านแต่ละรอบครบตามเกณฑ์ งานเสี่ยงสูงใช้ผู้ประเมิน 2 คน" },
  { title: "ใช้งานได้", text: "ชื่อเข้า portfolio ร้าน มีวันที่ได้ ทบทวนทุก 6 รอบ (12 สัปดาห์)" }
];

const levels = [
  {
    level: 1,
    name: "ฝึกหัด",
    can: "ทำได้เมื่อมีผู้ถือระดับ 3 อยู่ด้วย",
    how: "เรียนครบ + สอบความรู้ผ่าน ≥ 80% (Soft skill: ผู้ประเมินเห็นพฤติกรรมระดับ 1 อย่างน้อย 1 รอบ)"
  },
  {
    level: 2,
    name: "ทำเองได้",
    can: "รับงานจากบอร์ดได้ ร้านมอบงานจริง",
    how: "ผ่านเกณฑ์ระดับ 2 ครบ 2 รอบ ภายใน 3 รอบล่าสุด (6 สัปดาห์) · ตัวที่มีป้ายเสี่ยงสูงต้อง 2 รอบติดกัน"
  },
  {
    level: 3,
    name: "ชำนาญ",
    can: "สอนและโค้ชคนอื่น เป็นผู้ประเมินได้",
    how: "ถือระดับ 2 มาแล้ว ≥ 2 รอบ (4 สัปดาห์) + ผ่านเกณฑ์ระดับ 3 ครบ 4 รอบ ภายใน 5 รอบล่าสุด (10 สัปดาห์) + ไม่มีผิดพลาดร้ายแรงใน 4 รอบล่าสุด (8 สัปดาห์) + ผู้บริหารคุยประเมินเชิงลึก 1 ครั้ง"
  },
  {
    level: 4,
    name: "ออกแบบ",
    can: "ปรับขั้นตอน เขียนคู่มือ ออกข้อสอบของ skill นั้น",
    how: "ถือระดับ 3 ≥ 6 รอบ (12 สัปดาห์) + ทำโครงการปรับปรุง 1 ชิ้นที่วัดผลได้ · ผู้บริหาร 2 คนอนุมัติ (เฉพาะ Hard skill)"
  }
];

const dropCases = [
  {
    name: "ไม่ได้ทำนาน",
    example: "ลงผล \"ไม่ได้ทำ\" ติดกันเกิน 2 รอบ (4 สัปดาห์)",
    effect: "ต้องทบทวน (ทำได้เมื่อมีคนตรวจ) · ไม่ทบทวนภายใน 2 สัปดาห์ = ระงับ"
  },
  {
    name: "ต่ำกว่าระดับ",
    example: "ลงผล \"ต่ำกว่าระดับ\" 2 รอบติดกัน หรือ 2 ครั้งใน 3 รอบล่าสุด (6 สัปดาห์)",
    effect: "ลดลง 1 ระดับ แล้วนับรอบใหม่เพื่อกลับขึ้น"
  },
  {
    name: "พลาดโดยไม่ตั้งใจ",
    example: "นับเงินผิดเล็กน้อยครั้งแรก ลืมขั้นตอนหนึ่ง",
    effect: "ต้องทบทวน และดูว่าขั้นตอนทำให้พลาดง่ายหรือไม่ (ไม่ลดระดับ)"
  },
  {
    name: "พฤติกรรมเสี่ยง",
    example: "ข้ามขั้นตอนเพราะรีบ ไม่ถ่ายรูปการ์ดก่อนรับซื้อ",
    effect: "ต้องทบทวน + โค้ช · นับสะสมของ skill นั้นเริ่มใหม่"
  },
  { name: "ร้ายแรงหรือจงใจ", example: "รู้ว่าผิดแต่ทำซ้ำ ทุจริต บันทึกเท็จ", effect: "ระงับ + กระบวนการวินัย" }
];

const promotions = [
  {
    title: "ขั้น 2 · พนักงานประจำ",
    items: [
      "ทุกตัวชี้วัดถึงระดับในภาพ",
      "ทำงานมาแล้ว ≥ 3 เดือน (12 สัปดาห์)",
      "performance-score ≥ 80 ติดกัน 2 เดือน",
      "ไม่มีรอบ \"ต่ำกว่าระดับ\" ใน 2 รอบล่าสุด (4 สัปดาห์)"
    ]
  },
  {
    title: "ขั้น 3 · หัวหน้ากะ",
    items: [
      "ทุกตัวชี้วัดถึงระดับในภาพ",
      "เป็นประจำ ≥ 6 เดือน",
      "นำกะจริง 8 กะ ผู้ประเมินดู",
      "performance-score ≥ 80 ติดกัน 3 เดือน"
    ]
  },
  {
    title: "ขั้น 4 · ผู้จัดการสาขา",
    items: [
      "ทุกตัวชี้วัด ≥ 3",
      "เป็นหัวหน้ากะ ≥ 6 เดือน",
      "รักษาการแทนผู้บริหาร 2 สัปดาห์",
      "โค้ชพนักงานผ่านระดับ 2 คน · ผู้บริหาร 2 คนอนุมัติ"
    ]
  }
];

const scoreEvidence = [
  { name: "การเข้างาน", text: "ความรับผิดชอบ" },
  { name: "สต็อก", text: "Stock สินค้า · รอบคอบ" },
  { name: "เช็คลิสต์", text: "ทำงานตาม Checklist · ความสะอาดของร้าน · ซื่อสัตย์ (บันทึกเท็จหัก 10)" },
  { name: "บริการลูกค้า", text: "ใจบริการ · การสื่อสาร" },
  { name: "งานที่มอบหมาย", text: "งานที่ได้รับมอบหมาย · ความรับผิดชอบ · ทำงานเป็นทีม" }
];

const sections = [
  { id: "guide-weekly", label: "ประเมินทุก 2 สัปดาห์" },
  { id: "guide-levels", label: "ระดับ 1–4" },
  { id: "guide-drop", label: "ระดับลด" },
  { id: "guide-promote", label: "เลื่อนขั้น" },
  { id: "guide-hard", label: "Hard skill" },
  { id: "guide-soft", label: "Soft skill" }
];

function requiredText(required: Record<string, number>) {
  return careerStages.map((stage) => `${stage.label} ${required[stage.id] || "–"}`).join(" · ");
}

export function SkillReviewGuide() {
  return (
    <div className="skill-guide">
      <nav className="skill-guide__jump" aria-label="ไปที่หัวข้อ">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      <section className="owner-ops__panel" id="guide-weekly">
        <div className="section-heading">
          <p className="eyebrow">ประเมินทุก 2 สัปดาห์</p>
          <h3>ทำแบบนี้</h3>
        </div>
        <ol className="skill-guide__steps">
          {weeklySteps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <dl className="skill-guide__rows">
          {resultMeanings.map((item) => (
            <div key={item.id}>
              <dt>
                <span className={`skill-guide__result is-${item.id}`}>{item.label}</span>
              </dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="owner-ops__panel" id="guide-levels">
        <div className="section-heading">
          <p className="eyebrow">ทุก skill ขึ้นระดับด้วย 4 ขั้นเดียวกัน</p>
          <h3>เรียน → สอบ → ทดลองทำ → ใช้งานได้</h3>
        </div>
        <ol className="skill-guide__steps">
          {learnSteps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <dl className="skill-guide__rows">
          {levels.map((item) => (
            <div key={item.level}>
              <dt>
                <span className={`skill-guide__badge is-l${item.level}`}>{item.level}</span> {item.name}
              </dt>
              <dd>
                <strong>ร้านให้ทำ:</strong> {item.can}
                <br />
                <strong>ได้มาอย่างไร:</strong> {item.how}
              </dd>
            </div>
          ))}
        </dl>
        <p className="skill-guide__note">
          สอบไม่ผ่านหรือรอบไม่ผ่าน = ฝึกต่อ ไม่ใช่การลงโทษ · พนักงานที่ทำงานอยู่แล้วไม่ต้องเริ่มจากศูนย์: ใช้ 2 รอบแรก (4 สัปดาห์) ของระบบประเมินเพื่อยืนยันระดับตั้งต้น
        </p>
      </section>

      <section className="owner-ops__panel" id="guide-drop">
        <div className="section-heading">
          <p className="eyebrow">ระดับลด · ผู้ประเมิน</p>
          <h3>ระดับลดได้ ถ้าไม่ใช้หรือทำผิด</h3>
        </div>
        <dl className="skill-guide__rows">
          {dropCases.map((item) => (
            <div key={item.name}>
              <dt>{item.name}</dt>
              <dd>
                <span className="skill-guide__muted">{item.example}</span>
                <br />→ {item.effect}
              </dd>
            </div>
          ))}
        </dl>
        <p className="skill-guide__note">
          คนที่ผิดแล้วรายงานเอง ต้องไม่ถูกลงโทษหนักกว่าคนที่ผิดแล้วซ่อน · พนักงานเห็นผลแต่ละรอบของตัวเองและอุทธรณ์ได้ภายใน 7 วัน
        </p>
        <h4 className="skill-guide__sub">ใครเป็นผู้ประเมิน</h4>
        <ul className="skill-guide__list">
          <li>ตอนนี้ เนม และ แชมป์ เป็นผู้ประเมินและลงผลทุกตัวชี้วัด · ในอนาคตผู้ที่ถือ skill นั้นระดับ 3 และ &quot;นำกะ&quot; ระดับ 3 ช่วยประเมินได้</li>
          <li>
            งานป้าย <span className="skill-review__risk">เสี่ยงสูง</span> ต้องเนมและแชมป์ลงผลตรงกันทั้ง 2 คน · ผู้ประเมินเขียนสิ่งที่เห็น ไม่ใช่ความรู้สึก
          </li>
          <li>เพื่อนร่วมงานประเมิน 2 คน ทุก 12 สัปดาห์ (รายไตรมาส) ใช้เป็นหลักฐานเสริมของ Soft skill</li>
        </ul>
      </section>

      <section className="owner-ops__panel" id="guide-promote">
        <div className="section-heading">
          <p className="eyebrow">Career Path</p>
          <h3>เงื่อนไขเลื่อนขั้น</h3>
        </div>
        <div className="skill-guide__promote">
          {promotions.map((stage) => (
            <div key={stage.title}>
              <strong>{stage.title}</strong>
              <ul className="skill-guide__list">
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <h4 className="skill-guide__sub">ใช้ performance-score ที่มีอยู่แล้วเป็นหลักฐาน</h4>
        <dl className="skill-guide__rows">
          {scoreEvidence.map((item) => (
            <div key={item.name}>
              <dt>{item.name}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {(["hard", "soft"] as const).map((group) => (
        <section key={group} className={`owner-ops__panel skill-guide__group is-${group}`} id={`guide-${group}`}>
          <div className="section-heading">
            <p className="eyebrow">{group === "hard" ? "Hard skill · 7 ตัวชี้วัด" : "Soft skill · 8 ตัวชี้วัด"}</p>
            <h3>เกณฑ์ผ่านแต่ละรอบ</h3>
          </div>
          <p className="skill-review__days">
            {group === "hard"
              ? "รอบไหน (2 สัปดาห์) ทำได้ตามช่องระดับที่กำลังจะขึ้น = นับ 1 รอบ · ป้ายเสี่ยงสูง = ต้องรอบติดกัน + ผู้ประเมิน 2 คน"
              : "ไม่สอบข้อเขียน วัดจากพฤติกรรมที่เห็น · รอบที่นับต้องมีหลักฐาน ≥ 1 ชิ้น · ขึ้นระดับต้องมีหลักฐานรวม ≥ 3 ชิ้นจากอย่างน้อย 2 แหล่ง"}
          </p>
          <ol className="skill-guide__indicators">
            {skillIndicators
              .filter((indicator) => indicator.group === group)
              .map((indicator) => (
                <li key={indicator.id}>
                  <strong>
                    {indicator.name}
                    {indicator.highRisk ? <span className="skill-review__risk">เสี่ยงสูง</span> : null}
                  </strong>
                  <small className="skill-review__meta">ขั้นต่ำ: {requiredText(indicator.required)}</small>
                  <p>
                    <span className="skill-guide__badge is-l2">2</span> {indicator.criteria.l2}
                  </p>
                  <p>
                    <span className="skill-guide__badge is-l3">3</span> {indicator.criteria.l3}
                  </p>
                  <small className="skill-review__meta">หลักฐาน: {indicator.evidence}</small>
                </li>
              ))}
          </ol>
        </section>
      ))}

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">เก็บหลักฐาน</p>
          <h3>เก็บหลักฐานอย่างไร</h3>
        </div>
        <ul className="skill-guide__list">
          <li>บันทึกเหตุการณ์สำคัญ ทั้งดีและไม่ดี ภายในวันที่เกิด · เนมและแชมป์ใช้บันทึกนี้สรุปผลวันจันทร์หลังจบรอบ</li>
          <li>ทุกผลแต่ละรอบระบุจำนวนวันทำงานของคนนั้นไว้ด้วย เพื่อให้เห็นว่าผลมาจากกี่วัน</li>
          <li>ข้อมูลจากระบบ: การเข้างาน งานที่รับแล้วไม่จบ ส่วนต่างเงินและสต็อก ข้อร้องเรียน</li>
          <li>เพื่อนร่วมงานประเมิน 2 คน ทุก 12 สัปดาห์ · ทบทวนแผนพัฒนารายคนทุก 12 สัปดาห์</li>
        </ul>
        <p className="skill-guide__note">
          Soft skill สูงสุดระดับ 3 ตามภาพ Career Path · ตัวเลขทั้งหมดเป็นร่างให้ทีมผู้บริหารยืนยัน ยังไม่ใช่ฉบับกลาง
        </p>
      </section>
    </div>
  );
}
