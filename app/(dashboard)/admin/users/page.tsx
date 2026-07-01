import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export default async function AdminUsersPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,name,email,role,active,departments(display_name)")
    .order("name");

  return (
    <main className="page">
      <h1>ผู้ใช้</h1>
      <div className="panel user-list">
        {(data ? data : []).map((profile) => (
          <div key={profile.id}>
            <span>{profile.name}</span>
            <span>{profile.email}</span>
            <span>{profile.role}</span>
            <span>{profile.active ? "active" : "inactive"}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
