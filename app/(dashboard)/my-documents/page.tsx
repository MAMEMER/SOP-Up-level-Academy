import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { docIdFor, getDocRecord, staffForEmail } from "../../../lib/staff-documents-server.ts";
import { nicknameFor } from "../../../lib/staff-documents-server.ts";
import { deadlineText, docsStatus, isDocsEligible, prefillForm } from "../../../lib/staff-documents.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { StaffDocumentsForm } from "../../../components/StaffDocumentsForm.tsx";

// เอกสารของฉัน — พนักงานส่งข้อมูลประกันสังคม + บัญชีรับเงินเดือน ให้เจ้าของร้าน
// (ข้อมูลตรงเข้าไดรฟ์ของเจ้าของ). เจ้าของ/แอดมินไม่ต้องกรอก.

export const dynamic = "force-dynamic";

export default async function MyDocumentsPage() {
  const user = await requireUser();
  const staff = await staffForEmail(user.email);
  const today = formatWorkDate();

  if (!staff || !isDocsEligible(staff)) {
    return (
      <main className="page sdoc-page">
        <section className="board-hero">
          <div>
            <p className="eyebrow">เอกสารพนักงาน</p>
            <h2>เอกสารของฉัน</h2>
            <p>หน้านี้สำหรับพนักงานส่งเอกสารประกันสังคมและบัญชีรับเงินเดือน บัญชีนี้ไม่ต้องกรอก</p>
          </div>
          {user.role === "admin" ? (
            <div className="hero-actions">
              <Link href="/admin/staff-documents" className="primary-action">ดูสถานะของพนักงาน</Link>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  const record = await getDocRecord(docIdFor(staff)).catch(() => null);
  const status = docsStatus(record);
  const nickname = nicknameFor(staff);

  return (
    <main className="page sdoc-page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">เอกสารพนักงาน · {staff.employeeId}</p>
          <h2>ข้อมูลประกันสังคม และบัญชีเงินเดือน</h2>
          <p>
            {nickname} กรอกให้ตรงกับบัตรประชาชนและสมุดบัญชี แล้วแนบรูปบัตร + หน้าสมุดบัญชี ·{" "}
            <strong>{deadlineText(today)}</strong>
          </p>
        </div>
      </section>
      {user.isImpersonating ? <p className="sdoc-hint">โหมดดูแทนพนักงาน — ดูได้อย่างเดียว ส่งแทนไม่ได้</p> : null}
      <StaffDocumentsForm
        employeeId={staff.employeeId || staff.code}
        nickname={nickname}
        today={today}
        deadlineText={deadlineText(today)}
        prefill={prefillForm({ email: staff.email, employmentType: staff.employmentType })}
        initialStatus={status}
        initialSubmittedAt={record?.submittedAt ?? null}
        initialSubmitCount={record?.submitCount ?? 0}
        filesOnDrive={record?.filesOnDrive ?? []}
        pendingFiles={record?.pending?.files.map((file) => file.kind) ?? []}
        readOnly={user.isImpersonating}
      />
    </main>
  );
}
