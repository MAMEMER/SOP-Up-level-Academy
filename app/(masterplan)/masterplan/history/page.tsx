import Link from "next/link";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { memberName } from "../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { thaiDate, thaiDateTime } from "../../../../lib/masterplan-format.ts";
import { listChangelog, listMeetings } from "../../../../lib/masterplan-store.ts";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requireMasterplanMember();
  const [changelog, meetings] = await Promise.all([listChangelog(), listMeetings()]);
  return (
    <>
      <MpHead eyebrow="ประวัติ" title="ประวัติการแก้และการคุย" sub="ทุกครั้งที่ฉบับกลางเปลี่ยนจะมีบรรทัดที่นี่ พร้อมเวอร์ชันและคนแก้" />
      <div className="mp-split">
        <div className="mp-block">
          <h2 className="mp-h2">ประวัติฉบับกลาง</h2>
          {changelog.length === 0 ? <p className="mp-empty">ยังไม่มีการเปลี่ยนแปลง</p> : null}
          <ul className="mp-log">
            {changelog.map((line) => (
              <li key={line.id}>
                <span className="mp-log__ver">{line.slug === "kpis" ? "KPI" : `v${line.version}`}</span>
                <span className="mp-log__text">
                  {line.proposalCode ? (
                    <Link href={`/masterplan/proposals#${line.proposalCode}`} className="mp-code">
                      {line.proposalCode}
                    </Link>
                  ) : null}{" "}
                  {line.proposalCode ? line.summary.replace(line.proposalCode, "").trim() : line.summary}
                </span>
                <span className="mp-meta">
                  {memberName(line.by)} · {thaiDateTime(line.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mp-block">
          <h2 className="mp-h2">การคุยที่ผ่านมา</h2>
          {meetings.length === 0 ? <p className="mp-empty">ยังไม่มีการคุยที่ปิดไว้</p> : null}
          <ul className="mp-list">
            {meetings.map((meeting) => (
              <li key={meeting.date} className="mp-meeting">
                <p className="mp-meeting__date">{thaiDate(meeting.date)}</p>
                <p className="mp-meta">
                  เข้าคุย: {meeting.attendees.map(memberName).join(", ")} · ปิดโดย {memberName(meeting.closedBy)}
                </p>
                {meeting.summary ? <p className="mp-reason">{meeting.summary}</p> : null}
                {meeting.decisions.length > 0 ? (
                  <ul className="mp-meeting__decisions">
                    {meeting.decisions.map((d) => (
                      <li key={d.proposalId}>
                        <span className="mp-code">{d.code}</span> {d.verdict}
                        {d.note ? ` — ${d.note}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mp-meta">ไม่มีมติ</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
