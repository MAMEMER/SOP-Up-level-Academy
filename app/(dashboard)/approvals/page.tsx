import { redirect } from "next/navigation";
import { SopList } from "../../../components/SopList.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("sops")
    .select("id,title,status,departments(display_name)")
    .eq("status", "pending_approval");

  const items = (data ? data : []).map((sop) => ({
    id: sop.id,
    title: sop.title,
    status: sop.status,
    departmentName: (sop.departments as Array<{ display_name: string }> | null)?.[0]?.display_name || ""
  }));

  return <main className="page"><h1>รออนุมัติ</h1><SopList items={items} /></main>;
}
