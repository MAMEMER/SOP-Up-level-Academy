import { redirect } from "next/navigation";
import type { Role } from "./permissions.ts";
import { isPreviewMode } from "./preview-data.ts";
import { createClient } from "./supabase/server.ts";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
};

export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,name,email,role,department_id,active")
    .eq("id", authData.user.id)
    .single();

  if (error || !profile || !profile.active) {
    redirect("/login");
  }

  if (!isPreviewMode()) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("employee_login_events")
      .upsert(
        { user_id: profile.id, work_date: today, last_seen_at: new Date().toISOString() },
        { onConflict: "user_id,work_date" }
      );
  }

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    departmentId: profile.department_id
  };
}
