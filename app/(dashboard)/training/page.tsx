import Link from "next/link";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";

const manualMedia: Record<string, { src: string; alt: string; evidence: string[]; photoGuide?: string[] }> = {
  "open-store": {
    src: "/training/snack-shelf-opening.jpg",
    alt: "ตัวอย่างชั้นวางขนมเปิดร้านที่ต้องถ่ายเป็นหลักฐาน",
    evidence: [
      "รูปหน้าร้านพร้อมเปิด",
      "รูปชั้นวางขนมเปิดร้าน",
      "รูปเงินทอนหรือยอดเงิน",
      "ยืนยัน POS / QR Payment เปิดใช้งาน"
    ],
    photoGuide: [
      "ถ่ายให้เห็นชั้นวางขนมและน้ำทั้งชั้น",
      "จัดสินค้าให้เรียบร้อยก่อนถ่าย เช่น ขนมไม่ล้ม กล่องไม่บังสินค้า และชั้นไม่รก",
      "ถ่ายให้เห็นว่าพื้นที่พร้อมขายก่อนเปิดร้าน"
    ]
  },
  "stock-work": {
    src: "/training/stocktake.jpg",
    alt: "ตัวอย่างหน้า Stock Take ในมือถือที่ต้องส่งเป็นหลักฐาน",
    evidence: [
      "รูปหน้า Stock Take ในมือถือ",
      "ต้องเห็นปุ่ม Start New Stock Take หรือ Ongoing Session",
      "ต้องเห็นสถานะ In Progress พร้อมชื่อสาขา วันที่ และหมวดที่นับ",
      "รายการสินค้าที่ใกล้หมด",
      "หมายเหตุผลต่างถ้ามี"
    ],
    photoGuide: [
      "เปิดหน้า Stock Take ในมือถือ",
      "ถ่ายให้เห็น New Session / Start New Stock Take หรือ Ongoing Session",
      "ถ้ามีงานค้าง ต้องเห็นสถานะ In Progress, วันที่, และชื่อหมวด เช่น น้ำ, ขนม"
    ]
  },
  "daytime-work": {
    src: "/training/packing.jpg",
    alt: "ตัวอย่างการแพ็คสินค้าก่อนจัดส่ง",
    evidence: ["รูปสินค้าก่อนแพ็ค", "เลข tracking", "ข้อความแจ้งลูกค้า"]
  },
  "close-store": {
    src: "/training/closing-sales.jpg",
    alt: "ตัวอย่างการตรวจสอบยอดขายก่อนปิดร้าน",
    evidence: ["ยอดขายรวมและแยกช่องทาง", "รูปเงินสดปิดร้าน", "รายงานส่งต่อหัวหน้า"]
  }
};

export default function TrainingPage() {
  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero wi-hero">
        <div>
          <p className="eyebrow">WI Working Instruction</p>
          <h2>คู่มือวิธีปฏิบัติงานประจำร้าน</h2>
          <p>รายละเอียดวิธีการทำงานทีละขั้นตอน พร้อมรูปประกอบ จุดตรวจ และหลักฐานที่ต้องส่งใน checklist</p>
        </div>
      </section>

      <div className="wi-manual-list">
        {cardStoreWorkflow.map((phase, phaseIndex) => {
          const media = manualMedia[phase.id];
          return (
          <article key={phase.id} id={phase.id} className={`training-card wi-manual phase-${phase.category}`}>
            <div className="workflow-card-head">
              <span className="phase-icon">{phase.icon}</span>
              <div>
                <p className="eyebrow">WI-{String(phaseIndex + 1).padStart(2, "0")} · {phase.timeLabel}</p>
                <h3>{phase.title}</h3>
              </div>
            </div>

            <div className="wi-manual-body">
              <figure className="wi-figure">
                <a className="wi-image-link" href={media.src} target="_blank" rel="noreferrer">
                  <img src={media.src} alt={media.alt} />
                </a>
                <figcaption>{media.alt} · กดดูรูปตัวอย่างเต็ม</figcaption>
              </figure>

              <div className="wi-content">
                <section className="wi-summary-grid">
                  <div>
                    <h4>วัตถุประสงค์</h4>
                    <p>{phase.goal}</p>
                  </div>
                  <div>
                    <h4>ขอบเขต / เวลา</h4>
                    <p>{phase.timeLabel}</p>
                  </div>
                </section>

                <section>
                  <h4>ขั้นตอนการปฏิบัติงาน</h4>
                  <div className="wi-step-list">
                    {phase.sections.map((section, sectionIndex) => (
                      <div key={section.title} className="wi-step-section">
                        <strong>{sectionIndex + 1}. {section.title}</strong>
                        <ol>
                          {section.tasks.map((task) => (
                            <li key={task}>{task}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="wi-summary-grid">
                  <div>
                    <h4>หลักฐานที่ต้องแนบ</h4>
                    <ul>
                      {media.evidence.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4>สิ่งที่ต้องระวัง</h4>
                    <p>{phase.caution}</p>
                  </div>
                </section>

                {media.photoGuide ? (
                  <section className="wi-photo-guide">
                    <h4>วิธีถ่ายรูปหลักฐาน</h4>
                    <ol>
                      {media.photoGuide.map((item) => <li key={item}>{item}</li>)}
                    </ol>
                  </section>
                ) : null}

            {phase.checklist.length ? (
              <section>
                    <h4>จุดตรวจใน Checklist</h4>
                <ul>
                  {phase.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}

            {phase.example ? (
              <section className="example-box">
                <h4>ตัวอย่าง</h4>
                <pre>{phase.example}</pre>
              </section>
            ) : null}
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </main>
  );
}
