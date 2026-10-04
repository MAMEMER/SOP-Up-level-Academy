import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";

// หน้าเดิม "งานที่มอบหมายให้ฉัน" ย้ายไปเป็นหน้าแจ้งเตือนงาน (/my-tasks) + แฟ้มงาน (/my-tasks/file)
// ลิงก์เก่าใน LINE/บุ๊กมาร์กยังพามาถูกที่
export default async function ProjectsPage() {
  await requireUser();
  redirect("/my-tasks");
}
