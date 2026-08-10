import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { StaffManager } from "../../../../components/StaffManager.tsx";
import { ensureEmployeeIds, listStaff, removeStaff, saveStaff, seedStaffIfEmpty } from "../../../../lib/staff-store.ts";
import type { StaffRecord } from "../../../../lib/staff-records.ts";
import { branchConfigs } from "../../../../lib/store-config.ts";

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWithStatus(status: string) {
  redirect(`/admin/staff?status=${status}`);
}

async function saveStaffAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  if (user.role !== "admin" || user.isImpersonating) redirectWithStatus("denied");

  const email = stringValue(formData, "email");
  if (!email.includes("@")) redirectWithStatus("invalid_email");

  const onRoster = formData.get("onRoster") === "on";
  const code = stringValue(formData, "code");
  if (onRoster && !code) redirectWithStatus("code_required");

  try {
    await saveStaff({
      email,
      employeeId: stringValue(formData, "employeeId"),
      name: stringValue(formData, "name"),
      role: stringValue(formData, "role") as StaffRecord["role"],
      departmentId: stringValue(formData, "departmentId") || null,
      onRoster,
      code,
      displayName: stringValue(formData, "displayName"),
      employmentType: stringValue(formData, "employmentType") as StaffRecord["employmentType"],
      branch: stringValue(formData, "branch"),
      aliases: stringValue(formData, "aliases").split(",").map((alias) => alias.trim()).filter(Boolean),
      active: formData.get("active") === "on"
    });
  } catch (error) {
    redirectWithStatus(error instanceof Error && error.message === "staff_storage_unavailable" ? "storage" : "error");
  }

  revalidatePath("/admin/staff");
  redirectWithStatus("saved");
}

async function removeStaffAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  if (user.role !== "admin" || user.isImpersonating) redirectWithStatus("denied");

  const email = stringValue(formData, "email");
  // never let an admin delete the account they are signed in with
  if (email === user.actualEmail.toLowerCase()) redirectWithStatus("self");

  try {
    await removeStaff(email);
  } catch {
    redirectWithStatus("error");
  }

  revalidatePath("/admin/staff");
  redirectWithStatus("removed");
}

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกแล้ว — สิทธิ์เข้าระบบและตารางกะอัปเดตทันที" },
  removed: { tone: "success", text: "ลบออกจากระบบแล้ว — อีเมลนี้ login ไม่ได้อีก" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์แก้ไข (ต้องมีสิทธิ์จัดการ และไม่ได้อยู่ในโหมดดูแทนพนักงาน)" },
  invalid_email: { tone: "warning", text: "อีเมลไม่ถูกต้อง" },
  code_required: { tone: "warning", text: "ถ้าอยู่ในตารางกะ ต้องกรอกรหัสพนักงาน" },
  self: { tone: "warning", text: "ลบบัญชีตัวเองไม่ได้" },
  storage: { tone: "warning", text: "ยังต่อ Firestore ไม่ได้ — แก้ไม่ได้จนกว่าจะตั้งค่า service account" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ" }
};

export default async function AdminStaffPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  await seedStaffIfEmpty();
  await ensureEmployeeIds();
  const staff = await listStaff();
  const params = searchParams ? await searchParams : {};
  const status = params.status ? statusMessages[params.status] : undefined;
  const branches = branchConfigs.map((branch) => ({ key: branch.key, label: branch.displayName }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">STAFF</p>
          <h2>จัดการพนักงาน</h2>
          <p>
            เพิ่ม / แก้ / ปิดการใช้งานบัญชีได้จากหน้านี้ ไม่ต้องแก้โค้ดและไม่ต้อง deploy —
            อีเมลที่อยู่ในรายการนี้เท่านั้นที่ login ได้ และคนที่ติ๊ก “อยู่ในตารางกะ” จะขึ้นในตารางกะ, KPI และงานที่มอบหมาย
          </p>
        </div>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <StaffManager
        staff={staff}
        branches={branches}
        currentEmail={user.actualEmail.toLowerCase()}
        saveAction={saveStaffAction}
        removeAction={removeStaffAction}
      />
    </main>
  );
}
