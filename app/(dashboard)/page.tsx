import { SopList } from "../../components/SopList.tsx";
import { requireUser } from "../../lib/auth.ts";
import { createClient } from "../../lib/supabase/server.ts";

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sops")
    .select("id,title,status,departments(display_name)")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(10);

  const items = (data ? data : []).map((sop) => ({
    id: sop.id,
    title: sop.title,
    status: sop.status,
    departmentName: (sop.departments as Array<{ display_name: string }> | null)?.[0]?.display_name || ""
  }));

  return (
    <main className="page">
      <h1>หน้าหลัก</h1>
      <p>ฝ่ายของคุณ: {user.departmentId ? user.departmentId : "ไม่ระบุ"}</p>
      <h2>SOP ล่าสุด</h2>
      <SopList items={items} />
    </main>
  );
}
