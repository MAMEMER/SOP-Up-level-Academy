"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Folder, FolderOpen } from "lucide-react";
import { OwnerFeedback, ProgressLine, StateBadge, TaskTimeline, Thumbs, ToneDot, thaiDate } from "./TaskInboxParts.tsx";
import { TaskReviewForm } from "./TaskReviewForm.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { netReviewPoints, reviewEntriesFor } from "../lib/project-review.ts";
import { thaiMonthLabel } from "../lib/project-month.ts";
import { dueFor, fileSections, hasDailyUpdates, monthFolders, rowTone, taskState, type FileSections } from "../lib/task-inbox.ts";
import { fetchProjectsForStaff } from "../lib/work-projects-store.ts";
import type { WorkProject } from "../lib/work-projects.ts";

// แฟ้มงาน — แยกเป็นเดือน · ในเดือนแบ่ง 4 กอง (ต้องแก้ · กำลังทำ · รอตรวจ · เรียบร้อย) มีสีเขียว/แดง
// ใช้ 3 ที่: พนักงานดูแฟ้มตัวเอง · เจ้าของดูแฟ้มของน้องแต่ละคน · เจ้าของดูแฟ้มทั้งทีม (สาขา)
// เจ้าของกดเข้าไปในงานแล้วตรวจ/ให้คะแนนได้ในที่เดียวกัน
export function TaskFile({
  codes,
  branch,
  today,
  initialMonth,
  isAdmin = false
}: {
  codes: string[];
  /** ส่งมา = ดูทั้งทีมของสาขานี้ */
  branch?: string;
  today: string;
  initialMonth?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(initialMonth || null);
  const [openId, setOpenId] = useState<string | null>(null);
  const team = Boolean(branch);
  const codeKey = codes.join(",");

  const load = useCallback(async () => {
    try {
      // ดึงงานของทุกคนในแฟ้ม (ทีม = หลายคน) แล้วรวมไม่ให้ซ้ำ — งานของคนที่ข้ามสาขามาก็ต้องเห็น
      const lists = codeKey ? await Promise.all(codeKey.split(",").map((code) => fetchProjectsForStaff("", code))) : [];
      const byId = new Map(lists.flat().map((row) => [row.id, row]));
      setProjects([...byId.values()]);
      setError(null);
    } catch {
      setError("โหลดแฟ้มงานไม่สำเร็จ — ลองรีเฟรช");
    } finally {
      setLoading(false);
    }
  }, [codeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const folders = useMemo(() => monthFolders(projects, codes, today), [projects, codes, today]);
  const current = folders.find((folder) => folder.month === month) ?? folders[0];

  function choose(next: string) {
    setMonth(next);
    setOpenId(null);
    router.replace(`${pathname}?month=${next}`, { scroll: false });
  }

  if (loading) return <p className="ti-empty">กำลังโหลด…</p>;
  if (error) return <p className="ti-error">{error}</p>;
  if (!folders.length) return <p className="ti-empty">ยังไม่มีงานในแฟ้ม</p>;

  const sections = fileSections(current.tasks, codes);
  const order: Array<{ key: keyof FileSections; label: string }> = isAdmin
    ? [
        { key: "waiting", label: "รอตรวจ" },
        { key: "needsFix", label: "ต้องแก้ไข" },
        { key: "active", label: "กำลังทำ" },
        { key: "passed", label: "เรียบร้อยแล้ว" }
      ]
    : [
        { key: "needsFix", label: "ต้องแก้ไข" },
        { key: "active", label: "กำลังทำ" },
        { key: "waiting", label: "ส่งแล้ว รอตรวจ" },
        { key: "passed", label: "เรียบร้อยแล้ว" }
      ];

  return (
    <div className="ti-file">
      <div className="ti-folders" role="tablist" aria-label="แฟ้มรายเดือน">
        {folders.map((folder) => {
          const on = folder.month === current.month;
          return (
            <button key={folder.month} type="button" role="tab" aria-selected={on} className={on ? "ti-folder is-on" : "ti-folder"} onClick={() => choose(folder.month)}>
              {on ? <FolderOpen size={18} aria-hidden /> : <Folder size={18} aria-hidden />}
              <span className="ti-folder__name">{thaiMonthLabel(folder.month)}</span>
              <span className="ti-folder__counts">
                <span className="is-green">{folder.green} ผ่าน</span>
                <span className="is-red">{folder.red} แดง</span>
                {folder.waiting ? <span className="is-amber">{folder.waiting} รอตรวจ</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {order.map(({ key, label }) => {
        const list = sections[key];
        if (!list.length) return null;
        return (
          <section key={key} className="ti-section">
            <h3 className="ti-section__title">
              {label} <span>{list.length}</span>
            </h3>
            {list.map((task) => (
              <FileRow
                key={task.id}
                task={task}
                codes={codes}
                team={team}
                today={today}
                isAdmin={isAdmin}
                open={openId === task.id}
                onToggle={() => setOpenId(openId === task.id ? null : task.id)}
                onChanged={load}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function FileRow({
  task,
  codes,
  team,
  today,
  isAdmin,
  open,
  onToggle,
  onChanged
}: {
  task: WorkProject;
  codes: string[];
  team: boolean;
  today: string;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const tone = rowTone(task, codes, today);
  const people = task.assignees.filter((code) => codes.includes(code));
  const net = people.reduce((sum, code) => sum + netReviewPoints(reviewEntriesFor(task, code)), 0);
  const reviewed = people.some((code) => reviewEntriesFor(task, code).length > 0);

  return (
    <div className={`ti-row ti-row--${tone}${open ? " is-open" : ""}`}>
      <button type="button" className="ti-row__head" aria-expanded={open} onClick={onToggle}>
        <ToneDot tone={tone} />
        <span className="ti-row__main">
          {task.parentTitle ? <small className="ti-row__parent">{task.parentTitle}</small> : null}
          <strong className="ti-row__title">{task.title}</strong>
          <small className="ti-row__sub">
            กำหนด {thaiDate(dueFor(task, people[0] || task.assignees[0]))}
            {team ? ` · ${people.map(displayNameFor).join(", ")}` : ""}
          </small>
        </span>
        {reviewed ? (
          <span className={net < 0 ? "ti-pts is-neg" : "ti-pts"}>
            {net > 0 ? "+" : ""}
            {net}
          </span>
        ) : null}
        <ChevronDown size={18} aria-hidden className={open ? "ti-row__chev is-open" : "ti-row__chev"} />
      </button>

      {open ? (
        <div className="ti-row__body">
          <div className="ti-row__people">
            {people.map((code) => (
              <span key={code} className="ti-row__person">
                {displayNameFor(code)} <StateBadge project={task} assignee={code} today={today} />
              </span>
            ))}
          </div>
          {task.detail ? <p className="ti-card__detail">{task.detail}</p> : null}
          {task.expectedResult ? (
            <p className="ti-card__detail">
              <strong>งานเสร็จคือ</strong> {task.expectedResult}
            </p>
          ) : null}
          {hasDailyUpdates(task) ? <ProgressLine project={task} today={today} /> : null}

          {!isAdmin ? people.map((code) => <OwnerFeedback key={code} project={task} assignee={code} />) : null}

          {isAdmin
            ? people.map((code) => <AdminReviewSlot key={code} task={task} assignee={code} today={today} onSaved={onChanged} />)
            : null}

          <p className="ti-form__label">ประวัติงาน</p>
          <TaskTimeline project={task} />
        </div>
      ) : null}
    </div>
  );
}

/** ช่องตรวจงานรายคน — งานที่รอตรวจเปิดฟอร์มไว้เลย ที่เหลือกดเปิดเพื่อปรับผล/คะแนน */
function AdminReviewSlot({ task, assignee, today, onSaved }: { task: WorkProject; assignee: string; today: string; onSaved: () => Promise<void> }) {
  const state = taskState(task, assignee);
  const [open, setOpen] = useState(state === "submitted");
  const lastSub = (task.submissions || []).filter((entry) => entry.by === assignee || task.mode === "group").slice(-1)[0];
  return (
    <div className="ti-slot">
      {lastSub ? (
        <div className="ti-feedback is-sub">
          <p className="ti-feedback__head">
            <strong>{displayNameFor(lastSub.by)} ส่งงาน · {thaiDate(lastSub.date)}</strong>
          </p>
          {lastSub.note ? <p className="ti-feedback__note">{lastSub.note}</p> : null}
          <Thumbs urls={lastSub.images} />
        </div>
      ) : null}
      {open ? (
        <TaskReviewForm task={task} assignee={assignee} today={today} onSaved={async () => { setOpen(false); await onSaved(); }} />
      ) : (
        <button type="button" className="ti-btn ti-btn--soft" onClick={() => setOpen(true)}>
          {state === "passed" ? `ปรับผลตรวจ/คะแนนของ ${displayNameFor(assignee)}` : `ตรวจงานของ ${displayNameFor(assignee)}`}
        </button>
      )}
    </div>
  );
}
