import { requireUser } from "../../../lib/auth.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { SopList } from "../../../components/SopList.tsx";

type SopRow = {
  id: string;
  title: string;
  status: "draft" | "pending_approval" | "published" | "needs_revision";
  departments: Array<{ display_name: string }> | null;
};

export default async function DraftsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const query = supabase
    .from("sops")
    .select("id,title,status,departments(display_name)")
    .in("status", ["draft", "pending_approval", "needs_revision"]);

  const { data } = user.role === "leader"
    ? await query.eq("department_id", user.departmentId)
    : await query.eq("created_by", user.id);

  const items = (data ? data : []).map((sop: SopRow) => ({
    id: sop.id,
    title: sop.title,
    status: sop.status,
    departmentName: (sop.departments as Array<{ display_name: string }> | null)?.[0]?.display_name || ""
  }));

  return <main className="page"><h1>ร่างของฉัน</h1><SopList items={items} /></main>;
}
