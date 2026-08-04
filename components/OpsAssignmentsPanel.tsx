"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AssignmentGroup } from "../lib/assigned-work-teams.ts";
import { assignmentStatusLabel, assignmentStatusClass } from "../lib/assignment-view.ts";

// Owner ops "งานที่มอบหมาย" panel. Hydrates from the server-rendered snapshot, then polls
// /api/admin/ops/assignments every 60s (no-store) so a task assigned from /admin/assign —
// or a submission from a staff member — appears near-real-time without a manual reload.
// Same source of truth as /admin/assign and the KPI performance score.
const REFRESH_MS = 60_000;

function isImageUrl(url: string) {
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)/i.test(url) || /firebasestorage/.test(url);
}

export function OpsAssignmentsPanel({
  workDate,
  initialGroups
}: {
  workDate: string;
  initialGroups: AssignmentGroup[];
}) {
  const [groups, setGroups] = useState<AssignmentGroup[]>(initialGroups);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Re-sync whenever the selected date changes (server passes new initialGroups).
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups, workDate]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/admin/ops/assignments?date=${encodeURIComponent(workDate)}`, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const data = (await res.json()) as { groups?: AssignmentGroup[] };
        if (cancelled || !Array.isArray(data.groups)) return;
        setGroups(data.groups);
        setUpdatedAt(
          new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            hour: "2-digit",
            minute: "2-digit"
          }).format(new Date())
        );
      } catch {
        // keep last good data on a transient network error
      }
    }
    const timer = setInterval(pull, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workDate]);

  const total = groups.reduce((sum, group) => sum + group.memberCount, 0);

  return (
    <section className="owner-ops__panel">
      <div className="section-heading">
        <p className="eyebrow">assigned work</p>
        <h3>งานที่มอบหมาย ({total})</h3>
        <p>
          อัปเดตอัตโนมัติทุก 60 วินาที{updatedAt ? ` · ล่าสุด ${updatedAt} น.` : ""}
        </p>
      </div>

      {groups.length ? (
        <ul className="owner-ops__assignments">
          {groups.map((group) => (
            <li key={group.key} className="owner-ops__assignment">
              <div className="owner-ops__assignment-head">
                <Link href={`/assigned-work/task/${encodeURIComponent(group.members[0]?.assignmentId ?? "")}`}>
                  {group.title}
                </Link>
                <span className="owner-ops__assignment-type">
                  {group.type === "team" ? `งานทีม · ${group.memberCount} คน` : "งานเดี่ยว"}
                  {group.dueTime ? ` · ภายใน ${group.dueTime} น.` : ""}
                </span>
              </div>

              {group.detail ? <p className="owner-ops__assignment-detail">{group.detail}</p> : null}
              {group.location ? <p className="owner-ops__assignment-meta">ที่ไหน: {group.location}</p> : null}
              {group.expectedResult ? (
                <p className="owner-ops__assignment-meta">ผลลัพธ์: {group.expectedResult}</p>
              ) : null}
              {group.trackingNumber ? (
                <p className="owner-ops__assignment-meta">เลขแทค/พัสดุ: {group.trackingNumber}</p>
              ) : null}
              {group.attachments?.length ? (
                <p className="owner-ops__assignment-meta">
                  หลักฐานจากผู้สั่ง:{" "}
                  {group.attachments.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      ไฟล์{index + 1}{" "}
                    </a>
                  ))}
                </p>
              ) : null}

              <ul className="owner-ops__assignment-members">
                {group.members.map((member) => (
                  <li key={member.assignmentId} className="owner-ops__assignment-member">
                    <span className="owner-ops__assignment-member-name">
                      {member.displayName}
                      <em className={assignmentStatusClass[member.status]}>
                        {" "}
                        {assignmentStatusLabel[member.status]}
                      </em>
                    </span>
                    {member.submittedAt ? (
                      <span className="owner-ops__assignment-member-sub">
                        ส่งเมื่อ {member.submittedAt}
                        {member.submittedBy ? ` · โดย ${member.submittedBy}` : ""}
                      </span>
                    ) : null}
                    {member.note ? (
                      <span className="owner-ops__assignment-member-note">สิ่งที่ทำ: {member.note}</span>
                    ) : null}
                    {member.imageEvidence?.length ? (
                      <span className="owner-ops__assignment-member-note">
                        หลักฐาน:{" "}
                        {member.imageEvidence.map((url, index) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            รูป{index + 1}{" "}
                          </a>
                        ))}
                      </span>
                    ) : member.evidence ? (
                      <span className="owner-ops__assignment-member-note">
                        หลักฐาน:{" "}
                        {isImageUrl(member.evidence) ? (
                          <a href={member.evidence} target="_blank" rel="noreferrer">
                            เปิดรูป
                          </a>
                        ) : (
                          <a href={member.evidence} target="_blank" rel="noreferrer">
                            เปิดลิงก์
                          </a>
                        )}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="owner-ops__empty">ยังไม่มีงานที่มอบหมายของวันนี้</p>
      )}

      <Link href="/admin/assign" className="owner-ops__link">
        มอบหมายงาน →
      </Link>
    </section>
  );
}
