import type { SopStatus } from "../lib/permissions.ts";

const labels: Record<SopStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  published: "Published",
  needs_revision: "Needs revision"
};

export function StatusBadge({ status }: { status: SopStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
