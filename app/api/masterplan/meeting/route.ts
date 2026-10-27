import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { listProposals, putOne } from "../../../../lib/masterplan-store.ts";
import { MASTERPLAN_MEMBERS } from "../../../../lib/masterplan-access.ts";
import { bangkokDate, isVerdict, type MpMeeting, type Verdict } from "../../../../lib/masterplan.ts";

// ปิดการคุยวันนี้ → mp_meetings/{YYYY-MM-DD Asia/Bangkok}. Verdicts themselves are saved
// per proposal the moment they're clicked (PATCH /api/masterplan/proposals), so closing
// only snapshots today's decisions + attendees + summary. Closing again overwrites the
// same day's record (e.g. a late decision after closing).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const keys = MASTERPLAN_MEMBERS.map((m) => m.key as string);
  const attendees = (Array.isArray(body.attendees) ? body.attendees : []).filter(
    (key): key is string => typeof key === "string" && keys.includes(key)
  );
  if (attendees.length === 0) return bad("ติ๊กคนที่เข้าคุยอย่างน้อย 1 คน");
  const summary = text(body.summary).trim().slice(0, 4000);
  const date = bangkokDate();
  try {
    const decided = (await listProposals()).filter((p) => p.decidedOn === date);
    const meeting: MpMeeting = {
      date,
      attendees: [...new Set(attendees)],
      decisions: decided.map((p) => ({
        proposalId: p.id,
        code: p.code,
        verdict: (isVerdict(p.status) ? p.status : "ลง") as Verdict,
        note: p.decisionNote
      })),
      summary,
      closedBy: auth.member.key,
      closedAt: new Date().toISOString()
    };
    await putOne<MpMeeting>("mp_meetings", date, meeting);
    return NextResponse.json({ ok: true, date, decisions: meeting.decisions.length });
  } catch (error) {
    return storeError(error);
  }
}
