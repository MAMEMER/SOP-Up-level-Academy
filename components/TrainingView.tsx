"use client";

import Link from "next/link";
import { ArrowLeft, Folder, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cardStoreWorkflow } from "../lib/card-store-workflow.ts";
import { fetchChecklistConfig } from "../lib/daily-checklist-store.ts";
import { applyChecklistConfig, emptyChecklistConfig, type ChecklistConfig } from "../lib/daily-checklist.ts";
import { applyManualOverrides } from "../lib/work-manual.ts";
import { storehubStocktakesUrl, weeklyStockSleevePhase } from "../lib/weekly-stock-workflow.ts";
import { monthlyStockSinglePhase } from "../lib/monthly-stock-single-workflow.ts";
import { seatingTableRules, weeklyEvents } from "../lib/weekly-event-tasks.ts";

// Photos + evidence notes per phase. Phases without a photo (e.g. งานบนเว็บกิลด์)
// simply omit `src` — the manual still renders steps, evidence and cautions.
const manualMedia: Record<string, {
  src?: string;
  alt?: string;
  evidence: string[];
  photoGuide?: string[];
  proofExamples?: Array<{ src: string; alt: string; caption: string }>;
}> = {
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
    ],
    proofExamples: [
      {
        src: "/training/open-store-line-proof.jpg",
        alt: "ตัวอย่างการส่งงานเปิดร้านในกลุ่ม LINE Admin",
        caption: "ตัวอย่างการส่งงานเปิดร้านในกลุ่ม LINE Admin · กดดูรูปตัวอย่างเต็ม"
      }
    ]
  },
  "guild-chat-exp": {
    evidence: [
      "แคปหน้าจอกล่องแชทที่ตอบครบแล้ว",
      "แคปหน้า /admin ของเว็บกิลด์ หลังอนุมัติ Exp / เควสต์ค้างหมด"
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
    evidence: ["ยอดขายรวมและแยกช่องทาง", "รูปเงินสดปิดร้าน", "ส่งหลักฐานยืนยันในกลุ่ม LINE Admin"],
    proofExamples: [
      {
        src: "/training/line-admin-proof.jpg",
        alt: "ตัวอย่างข้อความและรูปหลักฐานที่ส่งในกลุ่ม LINE Admin",
        caption: "ตัวอย่างข้อความและรูปหลักฐานที่ส่งในกลุ่ม LINE Admin · กดดูรูปตัวอย่างเต็ม"
      }
    ]
  }
};

// Planogram (การจัดเรียงสินค้า) — a reference manual, not a checklist phase, so it
// doesn't add anything to the scored checklist.
const productDisplayPlans = [
  { src: "/training/planogram-cabinet.jpg", alt: "แปลนจัดตู้ไม้โชว์สินค้า แบ่งเกมตามคอลัมน์" },
  { src: "/training/planogram-wall.jpg", alt: "แปลนจัดผนังสินค้า 3 ชุด A · B · C" }
];

const productDisplaySteps = [
  {
    title: "แบ่งโซนตามเกม",
    tasks: [
      "ตู้ไม้: คอลัมน์ซ้าย Lorcana · กลาง Riftbound / ของเด่นประจำเดือน · ขวา Pokémon",
      "ผนัง B (สินค้าเกม): แถวบน Pokémon → แถวกลาง Lorcana → แถวล่าง Riftbound",
      "ชั้นวาง A และผนัง C: อุปกรณ์เสริมเท่านั้น (ซองการ์ด กล่องเด็ค ลูกเต๋า แฟ้ม แผ่นรองเล่น)",
      "สินค้าเกมเดียวกันต้องอยู่รวมกัน ห้ามกระจายหลายช่อง"
    ]
  },
  {
    title: "เลือกชั้นตามความสำคัญ",
    tasks: [
      "ชั้นบนสุด: ของชิ้นใหญ่ไว้โชว์ ให้เห็นจากไกล",
      "ระดับสายตา: ชุดใหม่ ของขายดี และป้ายโปรโมชันในกรอบอะคริลิก",
      "ระดับเอว: ชุดรอง ซอง และของเสริม",
      "ชั้นล่าง: ของราคาย่อมเยาและของเด็ก"
    ]
  },
  {
    title: "วางของให้เป็นมาตรฐาน",
    tasks: [
      "ทุกกล่องหันหน้าตรง ห่างขอบชั้นประมาณ 2 ซม.",
      "จัดของไว้กลางช่อง ใช้พื้นที่ประมาณ 70–80% ไม่ชิดซ้ายและไม่โล่งเกินครึ่ง",
      "วางช่องละ 1, 3 หรือ 5 ชิ้น หรือวางพีระมิด 2+1",
      "ของใหญ่อยู่หลังหรือบน ของเล็กอยู่หน้า",
      "ผนังแขวน: เรียงเต็มแถว ไม่เว้นช่องตรงกลาง ไม่แขวนเลยขอบแผง แผ่นรองเล่นต้องแขวน ห้ามตั้งพื้น"
    ]
  },
  {
    title: "ป้ายและความเรียบร้อย",
    tasks: [
      "ป้ายราคาขนาดเดียวกันทั้งร้าน ติดที่ขอบชั้นใต้สินค้า หรือที่ตะขอ",
      "ติดป้ายชื่อเกม / หมวดที่หัวคอลัมน์หรือหัวชั้น",
      "เก็บลังสต็อกไว้หลังร้าน หรือตู้บานเลื่อนใต้ตู้ไม้",
      "ด้านบนตู้: ป้ายโลโก้ร้านตรงกลาง ไม่วางของใช้ เช่น เครื่องพ่นน้ำหอม"
    ]
  }
];

export function TrainingView({ branch }: { branch: string }) {
  // The manual text is owner-editable at /admin/manual-config; the code below is the
  // fallback that ships with the app. Fetched client-side, same as the checklist config.
  const [config, setConfig] = useState<ChecklistConfig>(emptyChecklistConfig);

  useEffect(() => {
    let alive = true;
    fetchChecklistConfig(branch)
      .then((data) => alive && setConfig(data))
      .catch(() => alive && setConfig(emptyChecklistConfig));
    return () => {
      alive = false;
    };
  }, [branch]);

  // Build the same หัวข้อ list the checklist shows — built-in phases plus any custom
  // หัวข้อ the owner added, renamed titles applied, hidden ones dropped — then layer the
  // owner's manual text on top. Without the custom phases here, a หัวข้อ added at
  // /admin/checklist-config appeared in the checklist but never in this staff manual.
  const configuredPhases = applyChecklistConfig(cardStoreWorkflow, config);
  const manualPhases = applyManualOverrides(configuredPhases, config.manual);

  // แฟ้มคู่มือ (แบบเดียวกับแฟ้มงานที่มอบหมาย) — กดแฟ้มเพื่อเปิดดูรายละเอียดทีละเรื่อง.
  // ลิงก์เดิม /training#<id> จาก checklist ยังเปิดแฟ้มนั้นให้ตรงเรื่องเหมือนเดิม
  const folderGroups = [
    {
      title: "งานประจำวัน",
      items: manualPhases.map((phase, phaseIndex) => ({
        id: phase.id,
        code: `WI-${String(phaseIndex + 1).padStart(2, "0")}`,
        title: phase.title,
        time: phase.timeLabel
      }))
    },
    {
      title: "งานประจำสัปดาห์ / เดือน",
      items: [
        { id: weeklyStockSleevePhase.id, code: "WI-W1", title: weeklyStockSleevePhase.title, time: weeklyStockSleevePhase.timeLabel },
        { id: monthlyStockSinglePhase.id, code: "WI-M1", title: monthlyStockSinglePhase.title, time: monthlyStockSinglePhase.timeLabel }
      ]
    },
    {
      title: "การจัดร้าน",
      items: [{ id: "product-display", code: "WI-D1", title: "คู่มือการจัดเรียงสินค้า (Planogram)", time: "ทุกครั้งที่เติมของหรือของเข้าใหม่" }]
    },
    {
      title: "กิจกรรมประจำสัปดาห์",
      items: weeklyEvents.map((event) => ({ id: event.id, code: "Weekly event", title: event.name, time: event.timeWindow }))
    }
  ].filter((group) => group.items.length);

  const [openId, setOpenId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const scrollOnOpen = useRef(false);

  useEffect(() => {
    const syncFromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      scrollOnOpen.current = Boolean(id);
      setOpenId(id || null);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (openId && scrollOnOpen.current) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollOnOpen.current = false;
  }, [openId]);

  const openFolder = (id: string | null) => {
    scrollOnOpen.current = Boolean(id);
    setOpenId(id);
    window.history.replaceState(null, "", id ? `#${id}` : window.location.pathname + window.location.search);
  };

  const openItem = folderGroups.flatMap((group) => group.items).find((item) => item.id === openId);

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

      <div className="ti-file wi-file">
        {folderGroups.map((group) => (
          <section key={group.title} className="wi-folder-group">
            <h3 className="ti-section__title">
              {group.title} <span>{group.items.length}</span>
            </h3>
            <div className="ti-folders" role="tablist" aria-label={`แฟ้มคู่มือ${group.title}`}>
              {group.items.map((item) => {
                const on = item.id === openId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={item.id}
                    className={on ? "ti-folder is-on" : "ti-folder"}
                    onClick={() => openFolder(on ? null : item.id)}
                  >
                    {on ? <FolderOpen size={18} aria-hidden /> : <Folder size={18} aria-hidden />}
                    <span className="ti-folder__name">{item.title}</span>
                    <span className="wi-folder__meta">{item.code} · {item.time}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {!openItem ? <p className="ti-empty">กดแฟ้มด้านบนเพื่อเปิดดูรายละเอียดคู่มือแต่ละเรื่อง</p> : null}
      </div>

      <div ref={detailRef} className="wi-manual-list wi-file-detail">
        {openItem ? (
          <button type="button" className="ti-toggle" onClick={() => openFolder(null)}>
            <ArrowLeft size={16} aria-hidden /> ปิดแฟ้ม {openItem.code} · กลับไปเลือกแฟ้มอื่น
          </button>
        ) : null}
        {manualPhases.map((phase, phaseIndex) => {
          // fall back to an empty entry so adding a new phase can never 500 this page
          const media = manualMedia[phase.id] || { evidence: [] };
          return (
          <article key={phase.id} id={phase.id} hidden={openId !== phase.id} className={`training-card wi-manual phase-${phase.category}`}>
            <div className="workflow-card-head">
              <span className="phase-icon">{phase.icon}</span>
              <div>
                <p className="eyebrow">WI-{String(phaseIndex + 1).padStart(2, "0")} · {phase.timeLabel}</p>
                <h3>{phase.title}</h3>
              </div>
            </div>

            <div className="wi-manual-body">
              {media.src ? (
                <figure className="wi-figure">
                  <a className="wi-image-link" href={media.src} target="_blank" rel="noreferrer">
                    <img src={media.src} alt={media.alt} />
                  </a>
                  <figcaption>{media.alt} · กดดูรูปตัวอย่างเต็ม</figcaption>
                </figure>
              ) : null}

              {media.proofExamples?.map((example) => (
                <figure key={example.src} className="wi-figure">
                  <a className="wi-image-link" href={example.src} target="_blank" rel="noreferrer">
                    <img src={example.src} alt={example.alt} />
                  </a>
                  <figcaption>{example.caption}</figcaption>
                </figure>
              ))}

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

                {phase.sections.length ? (
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
                ) : null}

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

        <article
          id={weeklyStockSleevePhase.id}
          hidden={openId !== weeklyStockSleevePhase.id}
          className={`training-card wi-manual phase-${weeklyStockSleevePhase.category}`}
        >
          <div className="workflow-card-head">
            <span className="phase-icon">{weeklyStockSleevePhase.icon}</span>
            <div>
              <p className="eyebrow">WI-W1 · {weeklyStockSleevePhase.timeLabel}</p>
              <h3>{weeklyStockSleevePhase.title}</h3>
            </div>
          </div>

          <div className="wi-manual-body">
            <div className="wi-content">
              <section className="wi-summary-grid">
                <div>
                  <h4>วัตถุประสงค์</h4>
                  <p>{weeklyStockSleevePhase.goal}</p>
                </div>
                <div>
                  <h4>ขอบเขต / เวลา</h4>
                  <p>{weeklyStockSleevePhase.timeLabel}</p>
                </div>
              </section>

              <section>
                <h4>จุดตรวจใน Checklist</h4>
                <ul>
                  {weeklyStockSleevePhase.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section className="wi-summary-grid">
                <div>
                  <h4>หลักฐานที่ต้องแนบ</h4>
                  <ul>
                    <li>รูปแคปหน้า StoreHub Stock Take หลังนับสินค้า</li>
                    <li>สรุปรายการอุปกรณ์ / Sleeve ทั้งหมด (ชื่อสินค้า | จำนวนที่เหลือ)</li>
                    <li>สรุปรายการที่ตรงและไม่ตรง</li>
                  </ul>
                </div>
                <div>
                  <h4>สิ่งที่ต้องระวัง</h4>
                  <p>{weeklyStockSleevePhase.caution}</p>
                </div>
              </section>

              <section>
                <h4>ระบบที่เกี่ยวข้อง</h4>
                <ul>
                  <li>
                    <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer">StoreHub Stock Take</a>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </article>

        <article
          id={monthlyStockSinglePhase.id}
          hidden={openId !== monthlyStockSinglePhase.id}
          className={`training-card wi-manual phase-${monthlyStockSinglePhase.category}`}
        >
          <div className="workflow-card-head">
            <span className="phase-icon">{monthlyStockSinglePhase.icon}</span>
            <div>
              <p className="eyebrow">WI-M1 · {monthlyStockSinglePhase.timeLabel}</p>
              <h3>{monthlyStockSinglePhase.title}</h3>
            </div>
          </div>

          <div className="wi-manual-body">
            <div className="wi-content">
              <section className="wi-summary-grid">
                <div>
                  <h4>วัตถุประสงค์</h4>
                  <p>{monthlyStockSinglePhase.goal}</p>
                </div>
                <div>
                  <h4>ขอบเขต / เวลา</h4>
                  <p>{monthlyStockSinglePhase.timeLabel}</p>
                </div>
              </section>

              <section>
                <h4>จุดตรวจใน Checklist</h4>
                <ul>
                  {monthlyStockSinglePhase.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section className="wi-summary-grid">
                <div>
                  <h4>หลักฐานที่ต้องแนบ</h4>
                  <ul>
                    <li>รูป Binder / ตู้ / กล่อง Stock ก่อนเริ่มนับ และแคปหน้า StoreHub</li>
                    <li>รูปหลังนับ / จัดเข้าที่ ของการ์ดมูลค่าสูงหรือรายการที่ไม่ตรง</li>
                    <li>สรุปรายการ +/- พร้อมสาเหตุและรายการที่ต้องให้หัวหน้าตรวจ</li>
                  </ul>
                </div>
                <div>
                  <h4>สิ่งที่ต้องระวัง</h4>
                  <p>{monthlyStockSinglePhase.caution}</p>
                </div>
              </section>

              <section>
                <h4>ระบบที่เกี่ยวข้อง</h4>
                <ul>
                  <li>
                    <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer">StoreHub Stock Take</a>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </article>

        <article id="product-display" hidden={openId !== "product-display"} className="training-card wi-manual phase-stock">
          <div className="workflow-card-head">
            <span className="phase-icon">PG</span>
            <div>
              <p className="eyebrow">WI-D1 · ทุกครั้งที่เติมของหรือของเข้าใหม่</p>
              <h3>คู่มือการจัดเรียงสินค้า (Planogram)</h3>
            </div>
          </div>

          <div className="wi-plan-gallery">
            {productDisplayPlans.map((plan) => (
              <figure key={plan.src} className="wi-figure wi-plan">
                <a className="wi-image-link" href={plan.src} target="_blank" rel="noreferrer">
                  <img src={plan.src} alt={plan.alt} loading="lazy" />
                </a>
                <figcaption>{plan.alt} · กดดูรูปตัวอย่างเต็ม</figcaption>
              </figure>
            ))}
          </div>

          <div className="wi-content">
            <section className="wi-summary-grid">
              <div>
                <h4>วัตถุประสงค์</h4>
                <p>จัดตู้และผนังสินค้าให้เหมือนกันทุกสาขา ลูกค้าหาสินค้าเจอเร็ว และร้านดูเป็นมาตรฐาน</p>
              </div>
              <div>
                <h4>ขอบเขต / เวลา</h4>
                <p>ตู้ไม้โชว์สินค้า · ชั้นวาง A · ผนังแขวน B และ C · ทุกครั้งที่เติมของ ของเข้าใหม่ หรือเปลี่ยนโปรโมชัน</p>
              </div>
            </section>

            <section>
              <h4>ขั้นตอนการปฏิบัติงาน</h4>
              <div className="wi-step-list">
                {productDisplaySteps.map((section, sectionIndex) => (
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
                <h4>จุดตรวจหลังจัดเสร็จ</h4>
                <ul>
                  <li>สินค้าแต่ละเกมอยู่รวมกลุ่มเดียว ไม่กระจายหลายช่อง</li>
                  <li>ทุกกล่องหันหน้าตรง ไม่มีช่องโล่งเกินครึ่ง</li>
                  <li>ทุกชิ้นมีป้ายราคาแบบเดียวกัน</li>
                  <li>ไม่มีลังสต็อก บับเบิ้ล หรือของส่วนตัวให้ลูกค้าเห็น</li>
                </ul>
              </div>
              <div>
                <h4>สิ่งที่ต้องระวัง</h4>
                <p>ห้ามวางลังสต็อกที่มีสติกเกอร์ขนส่งไว้หน้าร้าน ห้ามแปะป้ายกระดาษบนกล่องลัง ให้ใส่กรอบอะคริลิกเสมอ</p>
              </div>
            </section>
          </div>
        </article>

        {weeklyEvents.map((event) => (
          <article key={event.id} id={event.id} hidden={openId !== event.id} className="training-card wi-manual phase-event">
            <div className="workflow-card-head">
              <span className="phase-icon">EV</span>
              <div>
                <p className="eyebrow">Weekly event · {event.timeWindow}</p>
                <h3>{event.name}</h3>
              </div>
            </div>

            <div className="wi-manual-body">
              <div className="wi-content">
                <section className="wi-summary-grid">
                  <div>
                    <h4>วัตถุประสงค์</h4>
                    <p>
                      บันทึกงานหลักของวันกิจกรรม {event.name} ตั้งแต่ Final ของแจกจนถึงสรุปและประกาศของรางวัล ·
                      ลงผลแต่ละรอบใน{event.lineGroup}
                    </p>
                  </div>
                  <div>
                    <h4>ขอบเขต / เวลา</h4>
                    <p>{event.timeWindow}</p>
                  </div>
                </section>

                <section>
                  <h4>Checklist วันกิจกรรม ({event.checklist.length} ข้อ)</h4>
                  <ol className="wi-step-list">
                    {event.checklist.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        {item.rule ? <span> — {item.rule}</span> : null}
                        <ul>
                          <li>ข้อมูลที่ต้องกรอก: {item.requiredData.map((field) => field.label).join(", ")}</li>
                          <li>หลักฐาน: {item.evidence.join(", ")}</li>
                          {item.hint ? <li>{item.hint}</li> : null}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </section>

                <section>
                  <h4>กติกาจำนวนโต๊ะตามจำนวนผู้เล่น</h4>
                  <ul>
                    {seatingTableRules.map((rule) => (
                      <li key={rule.players}>
                        {rule.players} = {rule.tables}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="example-box">
                  <strong>ตัวอย่างข้อความสรุป</strong>
                  <pre className="weekly-event-summary">{event.summaryTemplate}</pre>
                </section>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
