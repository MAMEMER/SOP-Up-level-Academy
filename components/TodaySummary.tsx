"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, ListChecks, PackageCheck, UserCheck } from "lucide-react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { formatWorkDate } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";
import { useShiftPhases } from "../lib/use-shift-phases.ts";
import { fetchStoreTasks } from "../lib/store-tasks-store.ts";
import { specsDueFor } from "../lib/work-spec.ts";
import { fetchProjectsForStaff } from "../lib/work-projects-store.ts";
import { needsSubmitToday } from "../lib/work-projects.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

// บนสุดของหน้าพนักงาน: "วันนี้ต้องทำอะไรบ้าง" รวมทุกกองไว้บรรทัดเดียวกัน — เช็คลิสต์ ·
// งานประจำ · งานที่มอบหมาย · งานส่งของ. ก่อนหน้านี้ทุกกองมีบล็อกของตัวเองเรียงลงไป
// พนักงานต้องเลื่อนอ่านทั้งหน้าถึงจะรู้ว่าเหลืออะไร กล่องนี้ตอบคำถามนั้นในหน้าจอเดียว
// แล้วค่อยกดลงไปทำในบล็อกจริงข้างล่าง.

type Row = {
  key: string;
  label: string;
  href: string;
  icon: typeof ListChecks;
  /** ยังไม่รู้ (กำลังโหลด) = null */
  remaining: number | null;
  total?: number;
  doneText: string;
};

export function TodaySummary({
  phases,
  branch,
  workDate,
  shift,
  staffCode,
  assignedRemaining,
  deliveryRemaining
}: {
  phases: WorkflowPhase[];
  branch: string;
  workDate: string;
  shift: ShiftCode | null;
  staffCode: string | null;
  /** งานที่เจ้าของมอบหมาย + งานส่งต่อ ที่ยังไม่ปิด (นับฝั่ง server แล้ว) */
  assignedRemaining: number;
  /** ออเดอร์ส่งของที่ยังไม่ส่ง */
  deliveryRemaining: number;
}) {
  const { records } = useWorkflowRecords();
  const { phases: shiftPhases, offDay } = useShiftPhases(phases, staffCode, branch, workDate);

  const [tasks, setTasks] = useState<{ remaining: number; total: number } | null>(null);
  const [projectsDue, setProjectsDue] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStoreTasks(branch, workDate)
      .then((data) => {
        if (!alive) return;
        const due = specsDueFor(data.tasks, { date: workDate, shift, staffCode });
        setTasks({ remaining: due.filter((task) => !data.records[task.id]).length, total: due.length });
      })
      .catch(() => alive && setTasks({ remaining: 0, total: 0 }));
    return () => {
      alive = false;
    };
  }, [branch, workDate, shift, staffCode]);

  useEffect(() => {
    let alive = true;
    if (!staffCode) {
      setProjectsDue(0);
      return;
    }
    fetchProjectsForStaff(branch, staffCode)
      .then((list) => alive && setProjectsDue(list.filter((project) => needsSubmitToday(project, workDate, staffCode)).length))
      .catch(() => alive && setProjectsDue(0));
    return () => {
      alive = false;
    };
  }, [branch, staffCode, workDate]);

  // วันหยุดของคนนี้ไม่ต้องนับเช็คลิสต์เป็นงานค้าง (กติกาเดียวกับการ์ดสถานะเช็คลิสต์)
  const checklistRemaining = offDay
    ? 0
    : shiftPhases.reduce((sum, phase) => {
        const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
        return sum + (record ? Math.max(0, record.total - record.completed) : phase.checklist.length);
      }, 0);
  const checklistTotal = offDay
    ? 0
    : shiftPhases.reduce((sum, phase) => {
        const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
        return sum + (record ? record.total : phase.checklist.length);
      }, 0);

  const rows: Row[] = [
    {
      key: "checklist",
      label: offDay ? "เช็คลิสต์ (วันหยุดของคุณ)" : "เช็คลิสต์ประจำกะ",
      href: "/checklist",
      icon: ListChecks,
      remaining: checklistRemaining,
      total: checklistTotal,
      doneText: offDay ? "วันนี้หยุด" : "ครบแล้ว"
    },
    {
      key: "tasks",
      label: "งานประจำที่ครบกำหนดวันนี้",
      href: "#today-tasks",
      icon: ClipboardList,
      remaining: tasks ? tasks.remaining : null,
      total: tasks?.total,
      doneText: "ครบแล้ว"
    },
    {
      key: "assigned",
      label: "งานที่มอบหมาย + งานส่งต่อ",
      href: "#assigned-work",
      icon: UserCheck,
      remaining: assignedRemaining,
      doneText: "ไม่มีค้าง"
    },
    {
      key: "projects",
      label: "งานเดี่ยว/กลุ่ม ที่ต้องส่งความคืบหน้าวันนี้",
      href: "#assigned-work",
      icon: CheckCircle2,
      remaining: projectsDue,
      doneText: "ส่งแล้ว"
    },
    {
      key: "delivery",
      label: "ออเดอร์ที่ต้องส่งวันนี้",
      href: "#delivery",
      icon: PackageCheck,
      remaining: deliveryRemaining,
      doneText: "ส่งครบแล้ว"
    }
  ];

  const known = rows.filter((row) => row.remaining !== null);
  const loading = known.length < rows.length;
  const totalLeft = known.reduce((sum, row) => sum + (row.remaining || 0), 0);

  return (
    <section className="today-summary soft-card">
      <div className="today-summary__head">
        <div>
          <p className="eyebrow">วันนี้ต้องทำอะไรบ้าง</p>
          <h3>
            {loading ? "กำลังรวมงานของวันนี้…" : totalLeft === 0 ? "เคลียร์ครบแล้ววันนี้" : `เหลืออีก ${totalLeft} อย่าง`}
          </h3>
        </div>
        <span className="today-summary__date">
          {formatWorkDate() === workDate ? "วันนี้" : workDate}
          {shift ? ` · กะ ${shift === "s1" ? "1" : "2"}` : ""}
        </span>
      </div>

      <ul className="today-summary__rows">
        {rows.map((row) => {
          const Icon = row.icon;
          const clear = row.remaining === 0;
          return (
            <li key={row.key} className={clear ? "today-summary__row is-clear" : "today-summary__row"}>
              <Link href={row.href}>
                <Icon size={18} aria-hidden />
                <span className="today-summary__label">{row.label}</span>
                <span className="today-summary__count">
                  {row.remaining === null
                    ? "…"
                    : clear
                      ? row.doneText
                      : `เหลือ ${row.remaining}${row.total ? `/${row.total}` : ""}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
