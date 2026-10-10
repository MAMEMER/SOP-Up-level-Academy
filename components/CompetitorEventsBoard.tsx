"use client";

import { useMemo, useState } from "react";
import { Clock, ExternalLink, Gift, MapPin, Ticket, Trophy, Users } from "lucide-react";
import {
  COMP_GAME_LABEL,
  EVENT_TYPE_LABEL,
  GAME_FILTERS,
  clashOn,
  feeLabel,
  groupByDate,
  matchesFilter,
  type CompetitorEvent,
  type GameFilter,
  type OurDay
} from "../lib/competitor-events.ts";
import { GAMES as BOARD_GAMES } from "../lib/activity-board.ts";
import type { CompetitorEventsData } from "../lib/competitor-events-server.ts";

export function CompetitorEventsBoard({ data, today }: { data: CompetitorEventsData; today: string }) {
  const [game, setGame] = useState<GameFilter>("");
  const [bkkOnly, setBkkOnly] = useState(false);

  const visible = useMemo(() => data.events.filter((e) => !e.ours), [data.events]);
  const groups = useMemo(
    () => groupByDate(visible.filter((e) => matchesFilter(e, game, bkkOnly)), today),
    [visible, game, bkkOnly, today]
  );
  const total = groups.reduce((n, g) => n + g.events.length, 0);

  if (!visible.length) {
    return <p className="detail-hint">บอทยังไม่ได้ส่งข้อมูลงานแข่ง รอบถัดไปจะอัปเดตเอง</p>;
  }

  return (
    <>
      <section className="cp-tools" aria-label="กรองงานแข่ง">
        <nav className="stock-loss-tabs cp-tabs" aria-label="เกม">
          {GAME_FILTERS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={g.key === game ? "is-active" : undefined}
              aria-pressed={g.key === game}
              onClick={() => setGame(g.key)}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <div className="stock-loss-tabs cp-tabs">
          <button type="button" className={bkkOnly ? "is-active" : undefined} aria-pressed={bkkOnly} onClick={() => setBkkOnly(!bkkOnly)}>
            <MapPin size={16} aria-hidden /> เฉพาะกรุงเทพฯ
          </button>
        </div>
        <p className="cp-count">{total.toLocaleString("th-TH")} งาน</p>
      </section>

      {groups.length === 0 ? (
        <p className="detail-hint">ไม่มีงานที่ตรงกับตัวกรองนี้</p>
      ) : (
        groups.map((group) => {
          const ours = group.date ? data.ours[group.date] : undefined;
          return (
            <section key={group.date ?? "undated"} className="ce-day" aria-label={group.label}>
              <header className="ce-day-head">
                <h3>{group.label}</h3>
                <span className="ce-day-count">{group.events.length} งาน</span>
              </header>
              {ours ? <OurLine ours={ours} /> : null}
              <ul className="ce-list">
                {group.events.map((e) => (
                  <EventRow key={`${group.date}-${e.id}`} e={e} ours={ours} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}

function OurLine({ ours }: { ours: OurDay }) {
  const games = ours.games.map((g) => BOARD_GAMES[g]?.name ?? g).join(" · ");
  return (
    <p className="ce-ours">
      ร้านเรา: {ours.titles.join(", ")}
      {games ? ` (${games})` : ""}
    </p>
  );
}

function EventRow({ e, ours }: { e: CompetitorEvent; ours?: OurDay }) {
  const clash = clashOn(e.game, ours);
  const fee = feeLabel(e);
  const type = EVENT_TYPE_LABEL[e.eventType];
  const where = [e.shop || "ไม่ทราบร้าน", e.location].filter(Boolean).join(" · ");
  return (
    <li className={`ce-row${clash === "strong" ? " is-clash" : ""}`}>
      <div className="ce-top">
        <span className="ce-where">{where}</span>
        {clash === "strong" ? (
          <span className="ce-badge is-strong">ชนกัน · เกมเดียวกัน</span>
        ) : clash === "soft" ? (
          <span className="ce-badge is-soft">วันเดียวกับงานเรา</span>
        ) : null}
      </div>
      <strong className="ce-title">{e.title || "(ไม่มีชื่องาน)"}</strong>
      <p className="ce-tags">
        <span className="ce-game">{COMP_GAME_LABEL[e.game]}</span>
        {type ? <span>{type}</span> : null}
        {e.bkk === false ? <span>ต่างจังหวัด</span> : null}
      </p>
      <ul className="ce-facts">
        {fee ? (
          <li>
            <Ticket size={15} aria-hidden /> <span>{fee}</span>
          </li>
        ) : null}
        {e.seats ? (
          <li>
            <Users size={15} aria-hidden /> <span>{e.seats.toLocaleString("th-TH")} ที่</span>
          </li>
        ) : null}
        {e.times ? (
          <li>
            <Clock size={15} aria-hidden /> <span>{e.times}</span>
          </li>
        ) : null}
      </ul>
      {e.prizes ? (
        <p className="ce-line ce-clamp">
          <Trophy size={15} aria-hidden /> <span>{e.prizes}</span>
        </p>
      ) : null}
      {e.doorGift ? (
        <p className="ce-line">
          <Gift size={15} aria-hidden /> <span>{e.doorGift}</span>
        </p>
      ) : null}
      {e.notes && !e.prizes ? <p className="ce-note">{e.notes}</p> : null}
      {e.postUrl ? (
        <a className="ce-link" href={e.postUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden /> ดูโพสต์
        </a>
      ) : null}
    </li>
  );
}
