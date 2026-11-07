"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Flag, MapPin, Play, Store } from "lucide-react";
import { memberName } from "../../lib/masterplan-access.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import {
  PRESENCE_BRANCHES,
  PRESENCE_MEMBERS,
  branchLabel,
  isPresenceMember,
  presenceByDate,
  presenceId,
  type OwnerPresence,
  type PresenceBranch
} from "../../lib/owner-presence.ts";
import { BOARD_BRANCHES, GAMES, addMonths, monthGrid, type BoardEvent } from "../../lib/activity-board.ts";
import type { BoardCard } from "../../lib/team-board.ts";

// ปฏิทินรายเดือน (จันทร์–อาทิตย์) ของบอร์ดทีม: วันเริ่มหยิบ / วันส่งของงาน + อีเวนต์ร้านจาก
// ตารางกิจกรรมกลาง (/admin/activities) ที่กดซ่อนได้ เพื่อดูว่าควรวางงานวันไหน.
// + Owner เข้าสาขา: จุดสีประจำคน (แชมป์ เหลือง · เนม เขียว · มุก ม่วง) แยกตามสาขา แต่ละคนลงของตัวเองรายวัน.

const TH_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const branchShort = (b: string) => BOARD_BRANCHES.find((x) => x.key === b)?.short ?? b;

type TaskMark = { kind: "start" | "due"; card: BoardCard };
type ShopMark = { key: string; time: string; title: string; branch: string; special: boolean };

export function TeamCalendar({
  cards,
  initialPresence,
  shopEvents,
  today,
  me,
  onPick
}: {
  cards: BoardCard[];
  initialPresence: OwnerPresence[];
  shopEvents: BoardEvent[];
  today: string;
  me: string;
  onPick: (date: string, field: "due" | "start") => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [showShop, setShowShop] = useLocalDraft<boolean>("tb-cal-shop", true);

  const [presence, setPresence] = useState<OwnerPresence[]>(initialPresence);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const canMark = isPresenceMember(me);

  const days = useMemo(() => monthGrid(shopEvents, month), [shopEvents, month]);
  const presenceMap = useMemo(() => presenceByDate(presence), [presence]);

  const reloadPresence = useCallback(async () => {
    const res = await mpApi<{ presence: OwnerPresence[] }>("presence", "GET");
    if (res.ok) setPresence(res.data.presence);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reloadPresence();
    }, 20_000);
    const onFocus = () => void reloadPresence();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [reloadPresence]);

  async function setMine(date: string, branch: PresenceBranch | "") {
    if (!isPresenceMember(me)) return;
    const before = presence;
    const id = presenceId(date, me);
    const rest = presence.filter((p) => p.id !== id);
    setPresence(branch ? [...rest, { id, date, member: me, branch, updatedAt: new Date().toISOString() }] : rest);
    setPresenceError(null);
    const res = await mpApi("presence", "PUT", { date, branch });
    if (!res.ok) {
      setPresence(before);
      setPresenceError(res.error);
    }
  }

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskMark[]>();
    const push = (d: string, m: TaskMark) => map.set(d, [...(map.get(d) ?? []), m]);
    for (const card of cards) {
      if (card.column === "done") continue;
      if (card.start && card.column === "todo" && card.start !== card.due) push(card.start, { kind: "start", card });
      if (card.due) push(card.due, { kind: "due", card });
    }
    return map;
  }, [cards]);

  const shopOn = (day: (typeof days)[number]): ShopMark[] =>
    showShop
      ? [
          ...day.specials.map((s, i) => ({ key: `s${i}`, time: s.time, title: s.title, branch: s.branch, special: true })),
          ...day.events.map((e) => ({ key: e.id, time: e.start, title: e.title || GAMES[e.game].name, branch: e.branch, special: false }))
        ]
      : [];

  const sel = days.find((d) => d.date === selected);
  const selTasks = tasksByDate.get(selected) ?? [];
  const selShop = sel ? shopOn(sel) : [];
  const selPresence = presenceMap.get(selected) ?? [];
  const myBranch = selPresence.find((p) => p.member === me)?.branch ?? "";
  const [y, m] = month.split("-").map(Number);

  return (
    <section className="tc" aria-label="ปฏิทินงาน">
      <div className="tc-bar">
        <button type="button" className="tc-nav" onClick={() => setMonth(addMonths(month, -1))} aria-label="เดือนก่อน">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <h2 className="tc-month">
          {TH_MONTHS_FULL[m - 1]} {y + 543}
        </h2>
        <button type="button" className="tc-nav" onClick={() => setMonth(addMonths(month, 1))} aria-label="เดือนถัดไป">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {month !== today.slice(0, 7) ? (
          <button
            type="button"
            className="mp-btn mp-btn--quiet"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            วันนี้
          </button>
        ) : null}
        <label className="tc-toggle">
          <input id="tc-show-shop" type="checkbox" checked={showShop} onChange={(e) => setShowShop(e.target.checked)} />
          <Store size={15} aria-hidden="true" /> อีเวนต์ร้าน
        </label>
      </div>

      <div className="tc-legend" aria-hidden="true">
        <span className="tc-dot is-start" /> เริ่มหยิบ <span className="tc-dot is-due" /> วันส่ง {showShop ? (<><span className="tc-dot is-shop" /> อีเวนต์ร้าน</>) : null}
        <span className="tc-legend__gap" />
        {PRESENCE_MEMBERS.map((k) => (
          <span key={k} className="tc-legend__who">
            <span className={`tc-pdot who-${k}`} /> {memberName(k)}
          </span>
        ))}
        <span>เข้าสาขา (บค บางแค · สฟ เสนาเฟสท์)</span>
      </div>

      <div className="tc-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="tc-wd" role="columnheader">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const tasks = tasksByDate.get(day.date) ?? [];
          const shop = shopOn(day);
          const here = presenceMap.get(day.date) ?? [];
          const late = tasks.some((t) => t.kind === "due" && day.date < today);
          const cls = [
            "tc-cell",
            day.inMonth ? "" : "is-out",
            day.date === today ? "is-today" : "",
            day.date === selected ? "is-selected" : "",
            day.day >= 5 ? "is-weekend" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const items = [
            ...tasks.map((t) => ({ key: t.kind + t.card.id, cls: `is-${t.kind}${late && t.kind === "due" ? " is-late" : ""}`, text: t.card.title, who: t.card.owner || "none" })),
            ...shop.map((s) => ({ key: s.key, cls: s.special ? "is-shop is-special" : "is-shop", text: `${s.time} ${s.title}`, who: "" }))
          ];
          return (
            <button key={day.date} type="button" role="gridcell" className={cls} aria-pressed={day.date === selected} onClick={() => setSelected(day.date)}>
              <span className="tc-num">{Number(day.date.slice(8))}</span>
              {here.length ? (
                <span className="tc-at" aria-hidden="true">
                  {PRESENCE_BRANCHES.filter((b) => here.some((p) => p.branch === b.key)).map((b) => (
                    <span key={b.key} className="tc-at__row">
                      <span className="tc-at__br">{b.short}</span>
                      {here
                        .filter((p) => p.branch === b.key)
                        .map((p) => (
                          <span key={p.member} className={`tc-pdot who-${p.member}`} />
                        ))}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="tc-dots" aria-hidden="true">
                {tasks.some((t) => t.kind === "start") ? <span className="tc-dot is-start" /> : null}
                {tasks.some((t) => t.kind === "due") ? <span className={`tc-dot is-due${late ? " is-late" : ""}`} /> : null}
                {shop.length ? <span className="tc-dot is-shop" /> : null}
              </span>
              <span className="tc-items">
                {items.slice(0, 3).map((it) => (
                  <span key={it.key} className={`tc-chip ${it.cls}${it.who ? ` who-${it.who}` : ""}`}>
                    {it.text}
                  </span>
                ))}
                {items.length > 3 ? <span className="tc-more">+{items.length - 3}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="tc-day">
        <div className="tc-day__head">
          <h3>{dayLabel(selected, today)}</h3>
          <div className="tc-day__btns">
            <button type="button" className="mp-btn" onClick={() => onPick(selected, "start")} disabled={selected < today}>
              <Play size={15} aria-hidden="true" /> ลงงานเริ่มวันนี้
            </button>
            <button type="button" className="mp-btn" onClick={() => onPick(selected, "due")} disabled={selected < today}>
              <Flag size={15} aria-hidden="true" /> ลงงานส่งวันนี้
            </button>
          </div>
        </div>
        <div className="tc-presence" aria-label="Owner เข้าสาขา">
          <ul className="tc-presence__list">
            {PRESENCE_MEMBERS.map((k) => {
              const mark = selPresence.find((p) => p.member === k);
              return (
                <li key={k} className={`tc-presence__who who-${k}${mark ? "" : " is-off"}`}>
                  <span className={`tc-pdot who-${k}`} aria-hidden="true" />
                  <span className="tc-presence__name">{memberName(k)}</span>
                  <span className="tc-presence__br">{mark ? branchLabel(mark.branch) : "ไม่ได้ลง"}</span>
                </li>
              );
            })}
          </ul>
          {canMark ? (
            <div className="tc-presence__pick" role="group" aria-label="วันนี้ฉันเข้าสาขา">
              <span className="tc-presence__label">
                <MapPin size={15} aria-hidden="true" /> ฉันเข้า
              </span>
              {PRESENCE_BRANCHES.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`mp-btn tc-presence__btn who-${me}${myBranch === b.key ? " is-on" : ""}`}
                  aria-pressed={myBranch === b.key}
                  disabled={selected < today}
                  onClick={() => void setMine(selected, b.key)}
                >
                  {b.name}
                </button>
              ))}
              <button
                type="button"
                className={`mp-btn mp-btn--quiet tc-presence__btn${myBranch ? "" : " is-on"}`}
                aria-pressed={!myBranch}
                disabled={selected < today}
                onClick={() => void setMine(selected, "")}
              >
                ไม่เข้า
              </button>
            </div>
          ) : null}
          {presenceError ? <p className="tc-presence__error" role="alert">{presenceError}</p> : null}
        </div>
        {selTasks.length === 0 && selShop.length === 0 ? <p className="tb-empty">วันนี้ว่าง ไม่มีงานหรืออีเวนต์</p> : null}
        <ul className="tb-day__items">
          {selTasks.map(({ kind, card }) => (
            <li key={kind + card.id} className={`tb-ev is-${kind} who-${card.owner || "none"}${card.owner === me ? " is-mine" : ""}`}>
              {kind === "start" ? <Play size={14} aria-hidden="true" /> : <Flag size={14} aria-hidden="true" />}
              <span className="tb-ev__kind">{kind === "start" ? "เริ่มหยิบ" : selected < today ? "เลยกำหนด" : "ส่ง"}</span>
              <span className="tb-ev__title">{card.title}</span>
              <span className={`tb-owner${card.owner ? "" : " is-none"}`}>{card.owner ? memberName(card.owner) : "ยังไม่มีคนรับ"}</span>
            </li>
          ))}
          {selShop.map((s) => (
            <li key={s.key} className={`tb-ev is-shop${s.special ? " is-special" : ""}`}>
              <Store size={14} aria-hidden="true" />
              <span className="tb-ev__kind">{s.time}</span>
              <span className="tb-ev__title">{s.title}</span>
              <span className="tb-by">{branchShort(s.branch)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function dayLabel(date: string, today: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"][d.getUTCDay()];
  const rel = date === today ? " (วันนี้)" : "";
  return `${wd} ${d.getUTCDate()} ${TH_MONTHS_FULL[d.getUTCMonth()]}${rel}`;
}

