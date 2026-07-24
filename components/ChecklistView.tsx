"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowChecklist } from "./WorkflowChecklist.tsx";
import { SharedPeriodicChecklist } from "./SharedPeriodicChecklist.tsx";
import { phasesForShift, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import { applyChecklistOverrides, type ChecklistOverrides } from "../lib/daily-checklist.ts";
import { fetchChecklistOverrides } from "../lib/daily-checklist-store.ts";
import type { Role } from "../lib/permissions.ts";
import { fetchShiftForStaffDate } from "../lib/shift-schedule-store.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";
import { shiftLabel } from "../lib/shift-schedule.ts";

type Tab = "daily" | "weekly" | "monthly";

// Client wrapper that makes the checklist shift-aware: the Daily tab shows only the
// phases for the staff member's shift today (opening staff don't see closing, etc.),
// while Weekly/Monthly are the team-shared tabs. Admins (no staffCode) see all daily
// phases so they can still review the full routine.
export function ChecklistView({
  phases,
  userEmail,
  userRole,
  staffCode,
  branch,
  workDate
}: {
  phases: WorkflowPhase[];
  userEmail: string;
  userRole: Role;
  staffCode: string | null;
  branch: string;
  workDate: string;
}) {
  const [tab, setTab] = useState<Tab>("daily");
  const [shift, setShift] = useState<ShiftCode | null>(null);
  const [shiftLoaded, setShiftLoaded] = useState(!staffCode);
  const [overrides, setOverrides] = useState<ChecklistOverrides>({});

  useEffect(() => {
    if (!staffCode) return;
    let alive = true;
    fetchShiftForStaffDate(branch, workDate, staffCode)
      .then((plan) => {
        if (!alive) return;
        setShift(plan?.assignment === "s1" || plan?.assignment === "s2" ? plan.assignment : null);
      })
      .catch(() => alive && setShift(null))
      .finally(() => alive && setShiftLoaded(true));
    return () => {
      alive = false;
    };
  }, [staffCode, branch, workDate]);

  useEffect(() => {
    let alive = true;
    fetchChecklistOverrides(branch)
      .then((data) => alive && setOverrides(data))
      .catch(() => alive && setOverrides({}));
    return () => {
      alive = false;
    };
  }, [branch]);

  const dailyPhases = useMemo(() => {
    const shiftFiltered = shift ? phasesForShift(phases, shift) : phases;
    return applyChecklistOverrides(shiftFiltered, overrides);
  }, [phases, shift, overrides]);

  return (
    <div className="checklist-view">
      <div className="checklist-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "daily"} className={tab === "daily" ? "is-active" : ""} onClick={() => setTab("daily")}>
          Daily {shift ? `· ${shiftLabel(shift)}` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "weekly"} className={tab === "weekly" ? "is-active" : ""} onClick={() => setTab("weekly")}>
          Weekly
        </button>
        <button type="button" role="tab" aria-selected={tab === "monthly"} className={tab === "monthly" ? "is-active" : ""} onClick={() => setTab("monthly")}>
          Monthly
        </button>
      </div>

      {tab === "daily" ? (
        <>
          {staffCode && shiftLoaded && !shift ? (
            <p className="checklist-view__note">วันนี้คุณไม่ได้ลงกะ — แสดง checklist ทั้งหมดไว้อ้างอิง</p>
          ) : null}
          <WorkflowChecklist phases={dailyPhases} userEmail={userEmail} userRole={userRole} />
        </>
      ) : (
        <SharedPeriodicChecklist period={tab} branch={branch} workDate={workDate} staffCode={staffCode ?? "-"} />
      )}
    </div>
  );
}
