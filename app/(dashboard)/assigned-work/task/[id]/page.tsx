import { requireUser } from "../../../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../../../lib/employee-directory.ts";
import { AssignmentDetail } from "../../../../../components/AssignmentDetail.tsx";

// Staff submit / owner review page for ONE owner→staff assignment (work_assignments).
// Server component only resolves who is looking (role + their staff code); the client
// child loads the assignment from Firestore and handles submit + review writes.
export default async function AssignmentTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const isOwner = user.role === "admin";
  const viewerCode = employeeCodeForEmail(user.email);

  return <AssignmentDetail id={decodeURIComponent(id)} isOwner={isOwner} viewerCode={viewerCode ?? null} />;
}
