import Link from "next/link";
import { createClient } from "../../../lib/supabase/server.ts";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id,display_name").order("display_name");

  return (
    <main className="page">
      <h1>ฝ่ายงาน</h1>
      <div className="panel list-panel">
        {(data ? data : []).map((department) => (
          <Link key={department.id} href={`/?department=${department.id}`}>{department.display_name}</Link>
        ))}
      </div>
    </main>
  );
}
