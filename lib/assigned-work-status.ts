import type { AssignedWork } from "./performance-score.ts";

type AssignedWorkStatusRecord = {
  workDate: string;
  status: AssignedWork["status"];
  submittedAt?: string;
};

export function isAssignedWorkPastDeadline(workDate: string, now = new Date()) {
  const deadlineBangkok = new Date(`${workDate}T16:59:59.999Z`);
  return now.getTime() > deadlineBangkok.getTime();
}

export function effectiveAssignedWorkStatus(record: AssignedWorkStatusRecord, now = new Date()): AssignedWork["status"] {
  if (!record.submittedAt && isAssignedWorkPastDeadline(record.workDate, now)) return "not_finished";
  return record.status;
}
