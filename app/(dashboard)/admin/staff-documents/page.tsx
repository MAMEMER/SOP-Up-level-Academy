import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FolderOpen } from "lucide-react";
import { requireUser } from "../../../../lib/auth.ts";
import { docIdFor, eligibleStaff, hasDriveBridge, listDocRecords, nicknameFor } from "../../../../lib/staff-documents-server.ts";
import { DOCS_STATUS_LABEL, STAFF_DOCS_DRIVE_ROOT, canRetryDrive, deadlineText, docsStatus, driveErrorText } from "../../../../lib/staff-documents.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { StaffDocsRetryButton } from "../../../../components/StaffDocsRetryButton.tsx";

// สถานะเอกสารประกันสังคมของพนักงาน — แอดมินเห็นแค่ "ส่งหรือยัง / ขึ้นไดรฟ์หรือยัง".
// ตัวข้อมูลกับไฟล์อยู่ในไดรฟ์ของแชมป์เท่านั้น หน้านี้ไม่แสดงข้อมูลส่วนตัวใดๆ.

export const dynamic = "force-dynamic";

function when(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default async function StaffDocumentsAdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const [staff, records] = await Promise.all([eligibleStaff(), listDocRecords().catch(() => new Map())]);
  const rows = staff.map((person) => {
    const record = records.get(docIdFor(person)) ?? null;
    return { person, record, status: docsStatus(record) };
  });
  const missing = rows.filter((row) => row.status === "not_submitted").length;
  const failed = rows.filter((row) => canRetryDrive(row.record)).length;
  const sheetUrl = rows.find((row) => row.record?.sheetUrl)?.record?.sheetUrl as string | undefined;

  return (
    <main className="page sdoc-page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">เอกสารพนักงาน</p>
          <h2>เอกสารประกันสังคม · บัญชีเงินเดือน</h2>
          <p>
            ยังไม่ส่ง <strong>{missing}</strong> จาก {rows.length} คน · {deadlineText(formatWorkDate())}
          </p>
        </div>
        <div className="hero-actions">
          <a href={STAFF_DOCS_DRIVE_ROOT} target="_blank" rel="noreferrer" className="primary-action">
            <FolderOpen size={18} aria-hidden /> เปิดโฟลเดอร์ในไดรฟ์
          </a>
          {sheetUrl ? (
            <a href={sheetUrl} target="_blank" rel="noreferrer" className="btn-soft">
              <ExternalLink size={18} aria-hidden /> ชีตข้อมูลพนักงาน
            </a>
          ) : null}
        </div>
      </section>

      {!hasDriveBridge() ? (
        <p className="sdoc-error">ยังไม่ได้ตั้งค่าการส่งขึ้นไดรฟ์ (STAFF_DOCS_GAS_URL / STAFF_DOCS_GAS_SECRET) — ข้อมูลจะค้างรอจนกว่าจะตั้งค่า</p>
      ) : null}

      <ul className="sdoc-admin-list">
        {rows.map(({ person, record, status }) => (
          <li key={person.email} className="sdoc-admin-row">
            <div className="sdoc-admin-who">
              <strong>{nicknameFor(person)}</strong>
              <span>{person.employeeId} · {person.employmentType === "full_time" ? "ประจำ" : "พาร์ทไทม์"}</span>
            </div>
            <div className="sdoc-admin-state">
              <span className={`sdoc-pill is-${status}`}>{DOCS_STATUS_LABEL[status]}</span>
              {record ? (
                <span className="sdoc-admin-meta">
                  ส่ง {when(record.submittedAt)}
                  {record.submitCount > 1 ? ` · ${record.submitCount} ครั้ง` : ""}
                  {record.driveSyncedAt ? ` · ขึ้นไดรฟ์ ${when(record.driveSyncedAt)}` : ""}
                </span>
              ) : null}
              {record?.driveError && status !== "on_drive" ? <span className="sdoc-admin-meta is-error">สาเหตุ: {driveErrorText(record.driveError)}</span> : null}
            </div>
            <div className="sdoc-admin-actions">
              {record?.driveFolderUrl ? (
                <a href={record.driveFolderUrl} target="_blank" rel="noreferrer" className="sdoc-btn-soft">
                  <FolderOpen size={18} aria-hidden /> โฟลเดอร์
                </a>
              ) : null}
              {canRetryDrive(record) && !user.isImpersonating ? <StaffDocsRetryButton docId={docIdFor(person)} /> : null}
            </div>
          </li>
        ))}
      </ul>

      {failed > 1 && !user.isImpersonating ? (
        <div className="sdoc-actions">
          <StaffDocsRetryButton label={`ลองส่งขึ้นไดรฟ์ใหม่ทั้งหมด (${failed})`} />
        </div>
      ) : null}

      <p className="sdoc-hint">
        ข้อมูลส่วนตัว (เลขบัตร บัญชี ที่อยู่) เก็บในไดรฟ์ของเจ้าของเท่านั้น — ระบบนี้ลบสำเนาทิ้งทันทีที่ขึ้นไดรฟ์สำเร็จ ·{" "}
        <Link href="/admin">กลับหน้ารวมงานจัดการ</Link>
      </p>
    </main>
  );
}
