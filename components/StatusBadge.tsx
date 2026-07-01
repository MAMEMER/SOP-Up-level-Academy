import type { SopStatus } from "../lib/permissions.ts";

const labels: Record<SopStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  published: "Published",
  needs_revision: "Needs Revision"
};

export function StatusBadge({ status }: { status: SopStatus }) {
  return <span className={`status ${status.replace("_", "-")}`}>{labels[status]}</span>;
}
