"use client";

import { useEffect, useState } from "react";
import { dailyScopeKey, shiftWorkDate } from "./work-records.ts";
import { fetchWorkRecordRange, fetchWorkRecordsForEveryone } from "./work-records-client.ts";
import {
  WORKFLOW_HISTORY_DAYS,
  formatWorkDate,
  recordsFromDayPayloads,
  type WorkflowDailyRecord,
  type WorkflowDayPayload
} from "./workflow-records.ts";

// Read-only views (dashboard tiles, manager review, monthly summary) share these loaders
// so every screen reads the same server records the checklist writes.

/** The signed-in (or impersonated) user's records for the last `days` days. */
export function useWorkflowRecords(options: { days?: number; employee?: string } = {}) {
  const days = options.days ?? WORKFLOW_HISTORY_DAYS;
  const employee = options.employee;
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = formatWorkDate();
    fetchWorkRecordRange("daily", dailyScopeKey(shiftWorkDate(today, -days)), dailyScopeKey(today), { employee })
      .then((result) => {
        if (cancelled) return;
        setRecords(recordsFromDayPayloads(result.records.map((doc) => doc.data as Partial<WorkflowDayPayload>)));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [days, employee]);

  return { records, loaded };
}

export type StaffDayRecords = {
  employeeName: string;
  employeeEmail: string;
  records: WorkflowDailyRecord[];
};

/** Admin view: every employee's records for one day. */
export function useWorkflowRecordsForDay(workDate: string) {
  const [staff, setStaff] = useState<StaffDayRecords[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchWorkRecordsForEveryone("daily", dailyScopeKey(workDate))
      .then((result) => {
        if (cancelled) return;
        setStaff(
          result.records
            .map((doc) => ({
              employeeName: doc.employeeName,
              employeeEmail: doc.employeeEmail,
              records: recordsFromDayPayloads([doc.data as Partial<WorkflowDayPayload>])
            }))
            .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
        );
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workDate]);

  return { staff, loaded };
}
