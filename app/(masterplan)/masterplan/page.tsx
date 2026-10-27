import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck, FileText, History, ListTodo, NotebookPen, Upload } from "lucide-react";
import { MpHead } from "../../../components/masterplan/MpHead.tsx";
import { memberName } from "../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../lib/masterplan-auth.ts";
import { thaiDate, thaiDateTime } from "../../../lib/masterplan-format.ts";
import { getDoc, listChangelog, listDocs, listProposals, listTasks } from "../../../lib/masterplan-store.ts";
import { DEFAULT_DOC_TITLES, MASTER_SLUG, REFERENCE_SLUGS, bangkokDate, isOverdue, type MpTask } from "../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

function TaskLine({ task, today }: { task: MpTask; today: string }) {
  const overdue = isOverdue(task, today);
  return (
    <li className="mp-line">
      <span className="mp-code">{task.code}</span>
      <span className="mp-line__text mp-ellipsis">{task.title}</span>
      <span className={`mp-line__meta${overdue ? " mp-overdue" : ""}`}>
        {task.due ? task.due : "-"} · {task.status}
      </span>
    </li>
  );
}

export default async function MasterplanHome() {
  const member = await requireMasterplanMember();
  const today = bangkokDate();
  const [master, docs, proposals, tasks, changelog] = await Promise.all([getDoc(MASTER_SLUG), listDocs(), listProposals(), listTasks(), listChangelog(6)]);
  const waiting = proposals.filter((p) => p.status === "รอคุย").length;
  const toApply = proposals.filter((p) => p.status === "ลง").length;
  const myDrafts = proposals.filter((p) => p.status === "ร่าง" && p.proposer === member.key).length;
  const myTasks = tasks.filter((t) => t.owner === member.key && t.status !== "เสร็จ");
  const overdue = tasks.filter((t) => isOverdue(t, today));
  const refs = REFERENCE_SLUGS.map((slug) => ({ slug, doc: docs.find((d) => d.slug === slug) }));

  return (
    <>
      <MpHead eyebrow={`สวัสดี ${member.name}`} title="Masterplan" sub={`${thaiDate(today)} · ทำงานร่วมกัน 4 คน: แชมป์ ท้อป เนม มุก`} back={null} />

      <div className="mp-today">
        <Link href="/masterplan/meeting" className="mp-today__item">
          <span className="mp-today__num">{waiting}</span>
          <span className="mp-today__label">
            ข้อเสนอรอคุยวันนี้ <ArrowRight size={15} aria-hidden="true" />
          </span>
        </Link>
        <Link href="/masterplan/tasks" className="mp-today__item">
          <span className="mp-today__num">{myTasks.length}</span>
          <span className="mp-today__label">
            งานของฉันที่ยังไม่เสร็จ <ArrowRight size={15} aria-hidden="true" />
          </span>
        </Link>
        <Link href="/masterplan/tasks" className={`mp-today__item${overdue.length ? " is-alert" : ""}`}>
          <span className="mp-today__num">{overdue.length}</span>
          <span className="mp-today__label">
            งานเลยกำหนด <ArrowRight size={15} aria-hidden="true" />
          </span>
        </Link>
        {toApply > 0 ? (
          <Link href="/masterplan/meeting" className="mp-today__item">
            <span className="mp-today__num">{toApply}</span>
            <span className="mp-today__label">
              รอนำเข้าฉบับกลาง <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>
        ) : null}
      </div>
      {myDrafts > 0 ? (
        <p className="mp-meta">
          มีร่างของฉัน {myDrafts} ข้อที่ยังไม่ได้ส่งเข้าวาระ — <Link href={`/masterplan/proposals?status=ร่าง&by=${member.key}`}>ไปดู</Link>
        </p>
      ) : null}

      <div className="mp-split">
        <div className="mp-block">
          <h2 className="mp-h2">งานของฉัน</h2>
          {myTasks.length === 0 ? (
            <p className="mp-empty">
              ยังไม่มีงานที่หยิบไว้ — <Link href="/masterplan/tasks">ไปหยิบงาน</Link>
            </p>
          ) : (
            <ul className="mp-lines">
              {myTasks.slice(0, 8).map((task) => (
                <TaskLine key={task.id} task={task} today={today} />
              ))}
            </ul>
          )}
          {overdue.length > 0 ? (
            <>
              <h2 className="mp-h2 mp-h2--gap">เลยกำหนด (ทุกคน)</h2>
              <ul className="mp-lines">
                {overdue.slice(0, 8).map((task) => (
                  <TaskLine key={task.id} task={task} today={today} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="mp-block">
          <h2 className="mp-h2">ฉบับกลางเปลี่ยนล่าสุด</h2>
          {changelog.length === 0 ? (
            <p className="mp-empty">ยังไม่มีการเปลี่ยนแปลง</p>
          ) : (
            <ul className="mp-lines">
              {changelog.map((line) => (
                <li key={line.id} className="mp-line">
                  <span className="mp-code">v{line.version}</span>
                  <span className="mp-line__text mp-ellipsis">{line.summary}</span>
                  <span className="mp-line__meta">
                    {memberName(line.by)} · {thaiDateTime(line.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/masterplan/history" className="mp-more">
            ดูประวัติทั้งหมด <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mp-block">
        <h2 className="mp-h2">ทำงานกันยังไง</h2>
        <div className="mp-layers">
          <div className="mp-layer">
            <p className="mp-layer__name">แกน · ฉบับกลาง</p>
            <p>เอกสารหลักที่ทุกคนยึด แก้ได้ทางเดียวคือ &ldquo;ข้อเสนอ&rdquo; จดความคิดในกระดาษทดก่อน แล้วเสนอแก้ทีละจุด ทุกวันคุยสั้นๆ ตัดสินว่า ลง / ไม่ลง / พักไว้ ข้อที่ลงจะถูกนำเข้าฉบับกลางพร้อมบันทึกประวัติ</p>
          </div>
          <div className="mp-layer">
            <p className="mp-layer__name">งาน</p>
            <p>สิ่งที่ต้องลงมือทำตามแผน ใครจะทำก็กด &ldquo;หยิบงาน&rdquo; แล้วอัปเดตสถานะ จนเสร็จ</p>
          </div>
        </div>
      </div>

      <div className="mp-block">
        <h2 className="mp-h2">ไปที่</h2>
        <ul className="mp-links">
          <li>
            <Link href="/masterplan/plan">
              <BookOpen size={18} aria-hidden="true" /> ฉบับกลาง{master ? ` · v${master.version}` : " · ยังไม่ได้นำเข้า"}
            </Link>
          </li>
          <li>
            <Link href={`/masterplan/scratch/${member.key}`}>
              <NotebookPen size={18} aria-hidden="true" /> กระดาษทดของฉัน
            </Link>
          </li>
          <li>
            <Link href="/masterplan/proposals">
              <FileText size={18} aria-hidden="true" /> ข้อเสนอทั้งหมด
            </Link>
          </li>
          <li>
            <Link href="/masterplan/meeting">
              <CalendarCheck size={18} aria-hidden="true" /> คุยวันนี้
            </Link>
          </li>
          <li>
            <Link href="/masterplan/tasks">
              <ListTodo size={18} aria-hidden="true" /> งาน
            </Link>
          </li>
          <li>
            <Link href="/masterplan/history">
              <History size={18} aria-hidden="true" /> ประวัติ
            </Link>
          </li>
          {member.editor ? (
            <li>
              <Link href="/masterplan/import">
                <Upload size={18} aria-hidden="true" /> นำเข้าเอกสาร / งาน
              </Link>
            </li>
          ) : null}
        </ul>
        <h2 className="mp-h2 mp-h2--gap">เอกสารอ้างอิง</h2>
        <ul className="mp-links">
          {refs.map(({ slug, doc }) => (
            <li key={slug}>
              {doc ? (
                <Link href={`/masterplan/docs/${slug}`}>
                  <FileText size={18} aria-hidden="true" /> {doc.title}
                </Link>
              ) : (
                <span className="mp-links__off">
                  <FileText size={18} aria-hidden="true" /> {DEFAULT_DOC_TITLES[slug]} · ยังไม่ได้นำเข้า
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
