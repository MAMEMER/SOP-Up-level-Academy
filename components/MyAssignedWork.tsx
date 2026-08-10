"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAssignmentsForStaff, type WorkAssignment } from "../lib/work-assignments-store.ts";
import {
  assignmentStatusClass,
  assignmentStatusLabel,
  groupAssignments,
  type AssignmentGroups
} from "../lib/assignment-view.ts";

const EMPTY: AssignmentGroups = { revision: [], overdue: [], today: [], submitted: [] };

// Staff "งานที่มอบหมายกับฉัน" board — every owner→staff assignment for this person,
// grouped ต้องแก้ไข / เกินกำหนด / วันนี้ / ส่งแล้ว. Each card links into the submit page.
export function MyAssignedWork({
  staffCode,
  branch,
  workDate
}: {
  staffCode: string;
  branch: string;
  workDate: string;
}) {
  const [groups, setGroups] = useState<AssignmentGroups>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAssignmentsForStaff(branch, staffCode)
      .then((rows) => alive && setGroups(groupAssignments(rows, workDate)))
      .catch(() => alive && setGroups(EMPTY))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, staffCode, workDate]);

  const total = groups.revision.length + groups.overdue.length + groups.today.length + groups.submitted.length;

  function renderGroup(label: string, items: WorkAssignment[], accent: string) {
    if (items.length === 0) return null;
    return (
      <div className="my-assigned__group">
        <p className={`my-assigned__group-label ${accent}`}>
          {label} ({items.length})
        </p>
        <div className="daily-phase-grid">
          {items.map((item, index) => (
            <Link
              key={item.id}
              href={`/assigned-work/task/${encodeURIComponent(item.id)}`}
              className={`daily-phase-card ${assignmentStatusClass[item.status]}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>กำหนด {item.workDate}{item.dueTime ? ` · ภายใน ${item.dueTime}` : ""}</small>
                <strong>{item.title}</strong>
                <em>{assignmentStatusLabel[item.status]}{item.detail ? ` · ${item.detail}` : ""}</em>
                {item.location ? <em>📍 {item.location}</em> : null}
                {item.expectedResult ? <em>✅ {item.expectedResult}</em> : null}
                {item.status === "needs_revision" && item.revisionNote ? (
                  <em>ต้องแก้: {item.revisionNote}</em>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="task-section my-assigned">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">Assigned to me</p>
          <h3>งานที่มอบหมายกับฉัน</h3>
        </div>
      </div>
      {loading ? (
        <p className="my-shift__loading">กำลังโหลด…</p>
      ) : total === 0 ? (
        <p className="my-shift__empty">ยังไม่มีงานที่ได้รับมอบหมาย</p>
      ) : (
        <div className="my-assigned__groups">
          {renderGroup("ต้องแก้ไข", groups.revision, "is-red")}
          {renderGroup("เกินกำหนด", groups.overdue, "is-red")}
          {renderGroup("วันนี้ / ที่ต้องทำ", groups.today, "is-white")}
          {renderGroup("ส่งแล้ว", groups.submitted, "is-green")}
        </div>
      )}
    </section>
  );
}
