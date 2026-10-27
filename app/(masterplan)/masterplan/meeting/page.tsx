import { ApplyQueue } from "../../../../components/masterplan/ApplyQueue.tsx";
import { MeetingBoard } from "../../../../components/masterplan/MeetingBoard.tsx";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { thaiDate } from "../../../../lib/masterplan-format.ts";
import { getDoc, getOne, listProposals } from "../../../../lib/masterplan-store.ts";
import { MASTER_SLUG, bangkokDate, type MpMeeting } from "../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

export default async function MeetingPage() {
  const member = await requireMasterplanMember();
  const today = bangkokDate();
  const [proposals, master, meeting] = await Promise.all([listProposals(), getDoc(MASTER_SLUG), getOne<MpMeeting>("mp_meetings", today)]);
  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, "en", { numeric: true });
  const agenda = proposals.filter((p) => p.status === "รอคุย").sort(byCode);
  const decidedToday = proposals.filter((p) => p.decidedOn === today && p.status !== "รอคุย").sort(byCode);
  const toApply = proposals.filter((p) => p.status === "ลง").sort(byCode);

  return (
    <>
      <MpHead eyebrow="คุยวันนี้" title={`วาระวันนี้ · ${thaiDate(today)}`} sub="คุยสั้นๆ ทีละข้อ แล้วตัดสิน ลง / ไม่ลง / พักไว้ — กดแล้วบันทึกทันที" />
      <MeetingBoard date={today} me={member.key} agenda={agenda} decidedToday={decidedToday} meeting={meeting} />
      <div className="mp-block">
        <h2 className="mp-h2">
          รอนำเข้าฉบับกลาง <span className="mp-count">{toApply.length}</span>
        </h2>
        <ApplyQueue items={toApply} master={master ? { markdown: master.markdown, version: master.version } : null} editor={member.editor} />
      </div>
    </>
  );
}
