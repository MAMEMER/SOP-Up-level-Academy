import Link from "next/link";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { memberName } from "../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { thaiDate, thaiDateTime } from "../../../../lib/masterplan-format.ts";
import { listChangelog, listDocs, listMeetings } from "../../../../lib/masterplan-store.ts";
import { DEFAULT_DOC_TITLES, MASTER_SLUG, type DocSlug, type MpChangelog } from "../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requireMasterplanMember();
  const [changelog, meetings, docs] = await Promise.all([listChangelog(), listMeetings(), listDocs()]);
  const titles = new Map(docs.map((doc) => [doc.slug, doc.title]));
  const masterLines = changelog.filter((line) => isMasterLine(line));
  const otherLines = changelog.filter((line) => !isMasterLine(line));
  return (
    <>
      <MpHead eyebrow="ประวัติ" title="ประวัติการแก้และการคุย" sub="ฉบับกลางแยกจากเอกสารอ้างอิง แต่ละเอกสารมีเลขเวอร์ชันของตัวเอง" />
      <div className="mp-split">
        <div className="mp-block">
          <h2 className="mp-h2">ประวัติฉบับกลาง</h2>
          <ChangelogList lines={masterLines} empty="ฉบับกลางยังไม่มีการเปลี่ยนแปลง" />
          <h2 className="mp-h2">เอกสารอ้างอิงและตัวชี้วัด</h2>
          <p className="mp-meta">กระดาษทด ผลตรวจ และเส้นทางสู่ Masterplan มีเลขเวอร์ชันของตัวเอง แก้ตรงนี้ไม่เปลี่ยนฉบับกลาง</p>
          <ChangelogList lines={otherLines} titles={titles} empty="ยังไม่มีการเปลี่ยนแปลง" />
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

// Lines without a slug predate per-doc tracking and were all ฉบับกลาง edits.
function isMasterLine(line: MpChangelog): boolean {
  return (line.slug ?? MASTER_SLUG) === MASTER_SLUG;
}

function docLabel(slug: string | undefined, titles: Map<string, string>): string {
  const key = slug ?? MASTER_SLUG;
  return titles.get(key) ?? DEFAULT_DOC_TITLES[key as DocSlug] ?? key;
}

function ChangelogList({ lines, titles, empty }: { lines: MpChangelog[]; titles?: Map<string, string>; empty: string }) {
  if (lines.length === 0) return <p className="mp-empty">{empty}</p>;
  return (
    <ul className="mp-log">
      {lines.map((line) => (
        <li key={line.id}>
          <span className="mp-log__ver">{line.slug === "kpis" ? "KPI" : `v${line.version}`}</span>
          <span className="mp-log__text">
            {titles && line.slug !== "kpis" ? <span className="mp-meta">{docLabel(line.slug, titles)} · </span> : null}
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
  );
}
