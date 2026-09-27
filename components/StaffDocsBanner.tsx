import Link from "next/link";
import { FileWarning } from "lucide-react";
import { docIdFor, getDocRecord, staffForEmail } from "../lib/staff-documents-server.ts";
import { deadlineText, shouldShowDocsBanner } from "../lib/staff-documents.ts";
import { formatWorkDate } from "../lib/workflow-records.ts";

// แถบ "ทำด่วน" ส่งเอกสารประกันสังคม — ขึ้นบนสุดของหน้าหลัก / งานของฉัน จนกว่าคนนั้นจะส่ง.
// เป็นแค่การเตือน ไม่ผูก KPI ไม่หักคะแนน. อ่านพลาด = ไม่ขึ้นแถบ (ไม่ทำให้หน้าพัง).
export async function StaffDocsBanner({ email }: { email: string | null | undefined }) {
  if (!email) return null;
  try {
    const staff = await staffForEmail(email);
    if (!staff) return null;
    const record = await getDocRecord(docIdFor(staff));
    if (!shouldShowDocsBanner(staff, record)) return null;
    return (
      <Link href="/my-documents" className="sdoc-banner">
        <FileWarning className="sdoc-banner-icon" aria-hidden />
        <span className="sdoc-banner-body">
          <span className="sdoc-banner-tag">ทำด่วน</span>
          <span className="sdoc-banner-title">ส่งเอกสารประกันสังคม + บัญชีรับเงินเดือน</span>
          <span className="sdoc-banner-detail">{deadlineText(formatWorkDate())} · ใช้เวลาประมาณ 5 นาที เตรียมบัตรประชาชนกับสมุดบัญชี</span>
        </span>
        <span className="sdoc-banner-cta">กรอกเลย</span>
      </Link>
    );
  } catch {
    return null;
  }
}
