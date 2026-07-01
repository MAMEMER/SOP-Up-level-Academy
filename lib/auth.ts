import { redirect } from "next/navigation";
import type { Role } from "./permissions.ts";
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

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    departmentId: profile.department_id
  };
}
