"use client";

import { useEffect, useState } from "react";
import { MyShiftToday } from "./MyShiftToday.tsx";
import { ChecklistView } from "./ChecklistView.tsx";
import { MyAssignedWork } from "./MyAssignedWork.tsx";
import { MyProjects } from "./MyProjects.tsx";
import { TaskFocusBoard } from "./TaskFocusBoard.tsx";
import { TodayTaskList } from "./TodayTaskList.tsx";
import { cardStoreWorkflow } from "../lib/card-store-workflow.ts";
import { fetchShiftForStaffDate } from "../lib/shift-schedule-store.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time"; email?: string };

// Owner review = "เข้าไปเหมือนกดตรงๆ": pick a staff member and render THEIR real
// interface, so the owner reviews exactly what the staff sees. Remounts on staff/date
// change via the key so each view loads fresh from Firestore for that person.
//
// เดิมหน้านี้โชว์แค่กะ + checklist ทั้งที่พนักงานเห็นมากกว่านั้น เจ้าของจึงดูแล้วไม่ตรงกับ
// ของจริง — ตอนนี้เรียงบล็อกเดียวกับหน้าพนักงาน: กะ · งานประจำที่ครบกำหนดวันนี้ ·
// งานที่มอบหมาย + งานส่งต่อ · งานเดี่ยว/กลุ่ม · checklist. ทุกบล็อกอ่านอย่างเดียว
// (จะกดแทนเขาจริงๆ ต้องใช้ "ดูเป็นคนนี้" ด้านบน ซึ่งก็ล็อกไม่ให้เขียนอยู่ดี)
export function StaffReviewView({
  branch,
  staff,
  defaultDate
}: {
  branch: string;
  staff: StaffOption[];
  defaultDate: string;
}) {
  const [staffCode, setStaffCode] = useState(staff[0]?.code ?? "");
  const [date, setDate] = useState(defaultDate);
  const selected = staff.find((s) => s.code === staffCode);

  return (
    <div className="staff-review">
      <div className="staff-review__controls">
        <label>
          พนักงาน
          <select value={staffCode} onChange={(e) => setStaffCode(e.target.value)}>
            {staff.map((s) => (
              <option key={s.code} value={s.code}>
                {s.displayName} ({s.employmentType === "full_time" ? "Full" : "Part"})
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {selected ? (
        <StaffBoard key={`${staffCode}:${date}`} branch={branch} staff={selected} date={date} />
      ) : null}
    </div>
  );
}

function StaffBoard({ branch, staff, date }: { branch: string; staff: StaffOption; date: string }) {
  const [shift, setShift] = useState<ShiftCode | null>(null);

  // กะของ "วันที่เลือก" ไม่ใช่ของวันนี้ — งานประจำกรองตามกะ ถ้าใช้กะผิดรายการก็ผิดตาม
  useEffect(() => {
    let alive = true;
    fetchShiftForStaffDate(branch, date, staff.code)
      .then((plan) => {
        if (!alive) return;
        const assignment = plan?.assignment;
        setShift(assignment === "s1" || assignment === "s2" ? assignment : null);
      })
      .catch(() => alive && setShift(null));
    return () => {
      alive = false;
    };
  }, [branch, date, staff.code]);

  return (
    <div className="staff-review__as">
      <p className="staff-review__as-note">
        กำลังดูมุมมองของ <strong>{staff.displayName}</strong> — บล็อกเดียวกับที่เขาเห็นตอน login (อ่านอย่างเดียว)
      </p>

      {/* งานค้างของคนนี้มาก่อน — เห็นทันทีว่าอะไรเลยกำหนด อะไรใกล้ครบ (ใบงาน YrTvFzXr) */}
      <TaskFocusBoard branch={branch} staffCode={staff.code} today={date} />

      <MyShiftToday staffCode={staff.code} branch={branch} workDate={date} />

      <section className="section-heading">
        <p className="eyebrow">งานวันนี้</p>
        <h3>งานประจำที่ครบกำหนด {date}</h3>
      </section>
      <TodayTaskList branch={branch} date={date} shift={shift} staffCode={staff.code} readOnly />

      <MyAssignedWork staffCode={staff.code} branch={branch} workDate={date} />

      <section className="section-heading">
        <p className="eyebrow">งานที่มอบหมาย</p>
        <h3>งานที่มอบหมาย (เดี่ยว / กลุ่ม)</h3>
      </section>
      <MyProjects branch={branch} staffCode={staff.code} today={date} readOnly />

      <ChecklistView
        phases={cardStoreWorkflow}
        userEmail={staff.email ?? `${staff.code.toLowerCase()}@review.local`}
        userRole="employee"
        staffCode={staff.code}
        branch={branch}
        workDate={date}
      />
    </div>
  );
}
