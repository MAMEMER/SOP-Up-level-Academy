"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import {
  BOARD_BRANCHES,
  BOARD_DAYS,
  GAMES,
  GAME_LOGOS,
  addMonths,
  monthGrid,
  type BoardBranch,
  type BoardEvent,
  type GameKey,
  type MonthDay
} from "../lib/activity-board.ts";
import { holidayName } from "../lib/planner-activities.ts";

// ปฏิทินรายเดือนของตารางกิจกรรม — กางแม่แบบรายสัปดาห์ลงทุกวันของเดือน + งานพิเศษ (Grand Opening ฯลฯ)
// อ่านอย่างเดียว แก้ที่มุมมองสัปดาห์. จอแคบเปลี่ยนเป็นรายการทีละวัน.

const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_TH[m - 1]} ${y + 543}`;
}

const PLATE_TEXT: Partial<Record<GameKey, string>> = { tac: "Tactic", cas: "Casual", open: "Open" };

const BRANCH_SHORT: Record<BoardBranch, string> = { bangkae: "บค", senafest: "สฟ" };

function GameMark({ game }: { game: GameKey }) {
  const logo = GAME_LOGOS[game];
  return logo ? (
    <span className="am-plate"><img src={logo} alt={GAMES[game].name} loading="lazy" /></span>
  ) : (
    <span className="am-plate is-text" title={GAMES[game].name}>{PLATE_TEXT[game] || GAMES[game].name}</span>
  );
}

/** ชื่อรอง = ตัดชื่อเกมออก ("Lorcana Pack Rush" → "Pack Rush") เพราะโลโก้บอกเกมแล้ว */
function subTitle(e: BoardEvent): string {
  const rest = e.title.replace(/^(Lorcana|Pokémon|Pokemon|Riftbound|Eidolon)\s*/i, "").trim();
  return GAME_LOGOS[e.game] ? rest : e.title;
}

function EventLine({ e, showBranch }: { e: BoardEvent; showBranch: boolean }) {
  const sub = subTitle(e);
  return (
    <div className="am-ev" data-game={e.game} title={`${e.title} ${e.start} · ${e.fee ? `${e.fee}฿` : "ไม่มีค่าสมัคร"}`}>
      <div className="am-ev1">
        <GameMark game={e.game} />
        <span className="am-t">{e.start}</span>
        {showBranch ? <span className={`am-br is-${e.branch}`}>{BRANCH_SHORT[e.branch]}</span> : null}
      </div>
      {sub ? <span className="am-n">{sub}</span> : null}
    </div>
  );
}

function DayBody({ d, branch }: { d: MonthDay; branch: BoardBranch | "all" }) {
  const events = d.events.filter((e) => branch === "all" || e.branch === branch);
  const specials = d.specials.filter((s) => branch === "all" || s.branch === branch);
  return (
    <>
      {specials.map((s) => (
        <div key={s.title} className="am-special">
          <PartyPopper aria-hidden />
          <div>
            <b>{s.title}</b>
            <small>{BOARD_BRANCHES.find((b) => b.key === s.branch)?.name} · {s.time}</small>
          </div>
        </div>
      ))}
      {events.map((e) => <EventLine key={e.id} e={e} showBranch={branch === "all"} />)}
    </>
  );
}

export function ActivityMonth({ events, today }: { events: BoardEvent[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [branch, setBranch] = useState<BoardBranch | "all">("all");
  const grid = useMemo(() => monthGrid(events, month), [events, month]);
  const big = grid.flatMap((d) => d.specials.filter((s) => s.date >= today && (branch === "all" || s.branch === branch)).map((s) => ({ ...s, d })));

  const counts = useMemo(() => {
    const c: Partial<Record<GameKey, number>> = {};
    for (const d of grid) for (const e of d.events) if (branch === "all" || e.branch === branch) c[e.game] = (c[e.game] || 0) + 1;
    return c;
  }, [grid, branch]);
  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="am">
      <div className="ab-toolbar">
        <div className="ab-week">
          <button type="button" className="ab-btn ab-icon" aria-label="เดือนก่อน" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </button>
          <button type="button" className="ab-btn ab-weeklabel" onClick={() => setMonth(today.slice(0, 7))}>
            {monthLabel(month)}
          </button>
          <button type="button" className="ab-btn ab-icon" aria-label="เดือนถัดไป" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </button>
        </div>
        <div className="am-seg" role="group" aria-label="เลือกสาขา">
          {([["all", "ทั้งสองสาขา"], ["bangkae", "บางแค"], ["senafest", "เสนาเฟสต์"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={branch === k} onClick={() => setBranch(k)}>{label}</button>
          ))}
        </div>
      </div>

      {big.map((s) => (
        <a key={s.date + s.title} className="am-hero" href={s.href || undefined} target="_blank" rel="noopener noreferrer">
          <span className="am-hero-date">
            <b>{Number(s.date.slice(8))}</b>
            {BOARD_DAYS[s.d.day].th}
          </span>
          <span className="am-hero-body">
            <small>{BOARD_BRANCHES.find((b) => b.key === s.branch)?.name} · {s.time}</small>
            <b>{s.title}</b>
            {s.detail ? <span>{s.detail}</span> : null}
          </span>
        </a>
      ))}

      <div className="am-summary">
        <span>ทั้งเดือน <b>{total}</b> รอบ</span>
        {(Object.keys(GAMES) as GameKey[]).filter((k) => counts[k]).map((k) => (
          <span key={k} className="am-count" data-game={k}><GameMark game={k} /><b>{counts[k]}</b></span>
        ))}
      </div>

      <div className="am-grid" aria-label={`ปฏิทิน ${monthLabel(month)}`}>
        {BOARD_DAYS.map((D, i) => <div key={D.en} className={`am-dow${i > 4 ? " is-we" : ""}`}>{D.th}</div>)}
        {grid.map((d) => {
          const hol = d.inMonth ? holidayName(d.date) : undefined;
          const cls = ["am-cell", !d.inMonth && "is-out", d.date < today && "is-past", d.date === today && "is-today", d.specials.length && "is-special"].filter(Boolean).join(" ");
          return (
            <div key={d.date} className={cls}>
              <div className="am-num"><span>{Number(d.date.slice(8))}</span>{hol ? <span className="am-hol">{hol}</span> : null}</div>
              {d.inMonth ? <DayBody d={d} branch={branch} /> : null}
            </div>
          );
        })}
      </div>

      <div className="am-agenda">
        {grid.filter((d) => d.inMonth).map((d) => {
          const hol = holidayName(d.date);
          const has = d.specials.length || d.events.some((e) => branch === "all" || e.branch === branch);
          const cls = ["am-aday", d.date < today && "is-past", d.date === today && "is-today", d.specials.length && "is-special"].filter(Boolean).join(" ");
          return (
            <div key={d.date} className={cls}>
              <div className="am-ad"><b>{Number(d.date.slice(8))}</b><span>{BOARD_DAYS[d.day].th}</span></div>
              <div className="am-alist">
                {hol ? <span className="am-hol">{hol}</span> : null}
                {has ? <DayBody d={d} branch={branch} /> : <span className="am-empty">ไม่มีกิจกรรม</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="am-foot">ปฏิทินกางจากตารางรายสัปดาห์ แก้กิจกรรมที่มุมมอง “สัปดาห์” · บค = บางแค · สฟ = เสนาเฟสต์ · วันที่มีงานพิเศษ สาขานั้นงดกิจกรรมประจำ</p>
    </div>
  );
}
