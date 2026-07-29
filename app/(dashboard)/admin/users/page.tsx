import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { sopUsers } from "../../../../lib/sop-users.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";

const roleLabel: Record<string, string> = {
  admin: "แอดมิน",
  leader: "หัวหน้า",
  employee: "พนักงาน"
};

// The allow-list in lib/sop-users.ts is what actually decides who can sign in, so
// this page reads from it directly. (It used to read a Supabase `profiles` table
// that nobody maintains — it showed a fake "Preview Leader" and missed new staff.)
export default async function AdminUsersPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const directoryByEmail = new Map(
    employeeDirectory.filter((entry) => entry.email).map((entry) => [entry.email!.toLowerCase(), entry])
  );

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">USERS</p>
          <h2>ผู้ใช้ที่เข้าระบบได้</h2>
          <p>
            รายชื่อนี้คือคนที่ login ด้วย Google ได้จริง — อีเมลนอกรายการนี้จะถูกปฏิเสธ
            เพิ่ม/ลบคนต้องแก้ที่ <code>lib/sop-users.ts</code> แล้ว deploy
          </p>
        </div>
      </section>

      <div className="panel user-list">
        {sopUsers.map((profile) => {
          const directory = directoryByEmail.get(profile.email);
          return (
            <div key={profile.email}>
              <span>{profile.name}</span>
              <span>{profile.email}</span>
              <span>{roleLabel[profile.role] || profile.role}</span>
              <span>
                {directory
                  ? `${directory.code} · ${directory.employmentType === "full_time" ? "Full" : "Part"}`
                  : "ไม่อยู่ในตารางกะ"}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
