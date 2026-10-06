"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, GripVertical, HelpCircle, Plus, RotateCcw, Undo2, UsersRound } from "lucide-react";
import { Modal } from "./Modal.tsx";
import { ActivityMonth } from "./ActivityMonth.tsx";
import {
  BOARD_BRANCHES,
  BOARD_DAYS,
  DEFAULT_BOARD,
  GAMES,
  OPEN_MIN,
  addDays,
  dayWarnings,
  eventSpan,
  fromMinutes,
  mondayOf,
  sortEvents,
  toMinutes,
  weekDates,
  type BoardBranch,
  type BoardEvent,
  type DayStaff,
  type GameKey
} from "../lib/activity-board.ts";

// บอร์ดกิจกรรมสองสาขาของเจ้าของ — แม่แบบรายสัปดาห์ + คนเข้ากะจริงของสัปดาห์ที่เลือก.
// บันทึกขึ้น server อัตโนมัติ (มีสำรองในเครื่องกันปิดหน้าก่อนบันทึกเสร็จ).

type SaveState = "loading" | "saved" | "saving" | "error" | "readonly";
type StaffByDate = Record<string, Partial<DayStaff>>;

const LOCAL_DRAFT = "sop-activity-board-draft-v1";
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const uid = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const BRANCH_NAME: Record<BoardBranch, string> = { bangkae: "บางแค", senafest: "เสนาเฟสต์" };

const SAVE_LABEL: Record<SaveState, string> = {
  loading: "กำลังโหลด…",
  saved: "บันทึกแล้ว",
  saving: "กำลังบันทึก…",
  error: "บันทึกไม่สำเร็จ · เก็บในเครื่องนี้ไว้ก่อน",
  readonly: "ดูอย่างเดียว"
};

function readDraft(): { events: BoardEvent[]; base: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_DRAFT) || "null");
    return raw && Array.isArray(raw.events) ? raw : null;
  } catch {
    return null;
  }
}
function writeDraft(value: { events: BoardEvent[]; base: string } | null) {
  try {
    if (value) localStorage.setItem(LOCAL_DRAFT, JSON.stringify(value));
    else localStorage.removeItem(LOCAL_DRAFT);
  } catch {
    /* private mode — ไม่เป็นไร server ยังเก็บอยู่ */
  }
}

export function ActivityBoard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [undoStack, setUndoStack] = useState<BoardEvent[][]>([]);
  const [save, setSave] = useState<SaveState>("loading");
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [staffByDate, setStaffByDate] = useState<StaffByDate>({});
  const [staffLoading, setStaffLoading] = useState(true);
  const [editing, setEditing] = useState<{ event: BoardEvent; isNew: boolean } | null>(null);
  const [dialog, setDialog] = useState<"help" | "reset" | null>(null);
  const [toast, setToast] = useState("");
  const [view, setViewState] = useState<"week" | "month">("week");
  useEffect(() => {
    try {
      if (localStorage.getItem("sop-activity-view") === "month") setViewState("month");
    } catch {}
  }, []);
  function setView(v: "week" | "month") {
    setViewState(v);
    try {
      localStorage.setItem("sop-activity-view", v);
    } catch {}
  }
  const baseRef = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);

  const pushToServer = useCallback(
    async (next: BoardEvent[]) => {
      setSave("saving");
      try {
        const res = await fetch("/api/activity-board", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ events: next, baseUpdatedAt: baseRef.current })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          baseRef.current = data.updatedAt || "";
          setEvents(data.events || []);
          writeDraft(null);
          setSave("saved");
          say("มีการแก้จากอีกเครื่อง โหลดตารางล่าสุดมาแล้ว");
          return;
        }
        if (!res.ok) throw new Error(data.error || String(res.status));
        baseRef.current = data.updatedAt || "";
        writeDraft(null);
        setSave("saved");
      } catch {
        setSave("error");
      }
    },
    [say]
  );

  const queueSave = useCallback(
    (next: BoardEvent[]) => {
      writeDraft({ events: next, base: baseRef.current });
      if (!canEdit) return;
      setSave("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void pushToServer(next), 600);
    },
    [canEdit, pushToServer]
  );

  const commit = useCallback(
    (next: BoardEvent[]) => {
      setUndoStack((stack) => [...stack.slice(-49), events]);
      setEvents(next);
      queueSave(next);
    },
    [events, queueSave]
  );

  // โหลดตาราง + คนเข้ากะของสัปดาห์
  useEffect(() => {
    let cancelled = false;
    setStaffLoading(true);
    fetch(`/api/activity-board?week=${monday}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return;
        setStaffByDate(data.staffByDate || {});
        setStaffLoading(false);
        if (loaded.current) return;
        loaded.current = true;
        baseRef.current = data.updatedAt || "";
        const draft = readDraft();
        // งานที่ยังไม่ทันขึ้น server (ปิดหน้า/เน็ตหลุด) — คืนให้ แล้วส่งต่อ ถ้าฐานยังตรงกัน
        if (draft && draft.base === baseRef.current && canEdit) {
          setEvents(draft.events);
          void pushToServer(draft.events);
          say("กู้งานที่ยังไม่ได้บันทึกกลับมาแล้ว");
        } else {
          setEvents(data.events || []);
          setSave(canEdit ? "saved" : "readonly");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStaffLoading(false);
        if (!loaded.current) {
          loaded.current = true;
          setEvents(readDraft()?.events || DEFAULT_BOARD);
          setSave("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [monday, canEdit, pushToServer, say]);

  const dates = useMemo(() => weekDates(monday), [monday]);
  // ตัวลากใช้ listener บน document ที่ผูกตอนเริ่มลาก — อ่านค่าล่าสุดผ่าน ref
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setEvents(prev);
    queueSave(prev);
    say("ย้อนกลับแล้ว");
  }

  // ---------- drag (pointer: เมาส์ + นิ้ว) ----------
  const drag = useRef<{ id: string; ghost: HTMLElement; lane: HTMLElement | null; card: HTMLElement } | null>(null);
  function onGripDown(ev: React.PointerEvent, id: string) {
    if (!canEdit) return;
    ev.preventDefault();
    const card = (ev.currentTarget as HTMLElement).closest(".ab-card") as HTMLElement;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add("ab-ghost");
    document.body.appendChild(ghost);
    card.classList.add("is-dragging");
    drag.current = { id, ghost, lane: null, card };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.ghost.style.left = `${e.clientX - 20}px`;
      d.ghost.style.top = `${e.clientY - 22}px`;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const lane = (el?.closest(".ab-lane") as HTMLElement | null) ?? null;
      if (lane !== d.lane) {
        d.lane?.classList.remove("is-over");
        lane?.classList.add("is-over");
        d.lane = lane;
      }
      if (e.clientY < 60) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    };
    const end = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.ghost.remove();
      d.card.classList.remove("is-dragging");
      d.lane?.classList.remove("is-over");
      if (e.type !== "pointerup" || !d.lane) return;
      const day = Number(d.lane.dataset.day);
      const branch = d.lane.dataset.branch as BoardBranch;
      const current = eventsRef.current;
      const target = current.find((x) => x.id === d.id);
      if (!target || (target.day === day && target.branch === branch)) return;
      commitRef.current(current.map((x) => (x.id === d.id ? { ...x, day, branch } : x)));
      say(`ย้าย ${target.title} ไป${BRANCH_NAME[branch]} วัน${BOARD_DAYS[day].th}`);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    move(ev.nativeEvent);
  }

  function openNew(day: number, branch: BoardBranch) {
    setEditing({
      isNew: true,
      event: { id: uid(), branch, day, game: "pkm", title: "Pokémon Standard", start: "19:00", dur: 3, fee: 220, cap: 16 }
    });
  }

  function copyText() {
    const lines: string[] = [];
    for (const br of BOARD_BRANCHES) {
      lines.push(`กิจกรรม ${br.name}`);
      BOARD_DAYS.forEach((D, d) => {
        const list = sortEvents(events.filter((e) => e.branch === br.key && e.day === d));
        lines.push(`${D.th}: ${list.length ? list.map((e) => `${e.dur ? `${e.start} ` : ""}${e.title}${e.fee ? ` ${e.fee}฿` : ""}`).join(" · ") : "-"}`);
      });
      lines.push("");
    }
    const text = lines.join("\n").trim();
    navigator.clipboard.writeText(text).then(
      () => say("คัดลอกแล้ว วางในแชทได้เลย"),
      () => say("คัดลอกไม่ได้ในเบราว์เซอร์นี้")
    );
  }

  const summary = (["pkm", "lor", "rb", "eid", "tac", "cas"] as GameKey[])
    .map((k) => ({
      k,
      bk: events.filter((e) => e.game === k && e.branch === "bangkae").length,
      sf: events.filter((e) => e.game === k && e.branch === "senafest").length
    }))
    .filter((x) => x.bk || x.sf);

  const viewToggle = (
    <div className="am-seg am-view" role="group" aria-label="มุมมอง">
      <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>รายสัปดาห์</button>
      <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>ปฏิทินเดือน</button>
    </div>
  );

  if (view === "month") {
    return (
      <section className="ab">
        {viewToggle}
        <ActivityMonth events={events} today={today} />
      </section>
    );
  }

  return (
    <section className="ab">
      {viewToggle}
      <div className="ab-toolbar" role="toolbar" aria-label="เครื่องมือตาราง">
        <div className="ab-week">
          <button type="button" className="ab-btn ab-icon" aria-label="สัปดาห์ก่อน" onClick={() => setMonday(addDays(monday, -7))}>
            <ChevronLeft />
          </button>
          <button type="button" className="ab-btn ab-weeklabel" onClick={() => setMonday(mondayOf(today))}>
            {shortDate(dates[0])} – {shortDate(dates[6])}
          </button>
          <button type="button" className="ab-btn ab-icon" aria-label="สัปดาห์ถัดไป" onClick={() => setMonday(addDays(monday, 7))}>
            <ChevronRight />
          </button>
        </div>
        {canEdit ? (
          <button type="button" className="ab-btn ab-primary" onClick={() => openNew(0, "senafest")}>
            <Plus /> เพิ่มกิจกรรม
          </button>
        ) : null}
        <button type="button" className="ab-btn" onClick={undo} disabled={!undoStack.length}>
          <Undo2 /> ย้อนกลับ
        </button>
        <button type="button" className="ab-btn" onClick={copyText}>
          <Copy /> คัดลอก
        </button>
        {canEdit ? (
          <button type="button" className="ab-btn" onClick={() => setDialog("reset")}>
            <RotateCcw /> เริ่มใหม่
          </button>
        ) : null}
        <button type="button" className="ab-btn ab-icon" aria-label="วิธีใช้" onClick={() => setDialog("help")}>
          <HelpCircle />
        </button>
        <span className={`ab-save is-${save}`}>
          <i />
          {SAVE_LABEL[save]}
        </span>
      </div>

      {summary.length ? (
        <div className="ab-summary" aria-label="จำนวนกิจกรรมต่อสัปดาห์">
          {summary.map((x) => (
            <span key={x.k} className="ab-chip" data-game={x.k}>
              <span className="ab-sw" />
              <b>{GAMES[x.k].name}</b>
              <span className="ab-bk">บค {x.bk}</span>
              <span className="ab-sf">สฟ {x.sf}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="ab-board" aria-label="ตารางรายสัปดาห์">
        <div className="ab-bh">วัน</div>
        <div className="ab-bh is-bangkae"><span className="ab-dot" />บางแค</div>
        <div className="ab-bh is-senafest"><span className="ab-dot" />เสนาเฟสต์</div>
        {BOARD_DAYS.map((D, d) => {
          const date = dates[d];
          const dayStaff = staffByDate[date];
          const { warnings, flags } = dayWarnings(events, d, dayStaff as DayStaff | undefined);
          const warnEls = warnings.map((w, i) => (
            <div key={i} className={`ab-warn is-${w.level}`}>{w.text}</div>
          ));
          return (
            <div key={d} className="ab-row">
              <div className={`ab-dcell${date === today ? " is-today" : ""}`}>
                <span className="ab-dn">{D.th}</span>
                <span className="ab-de">{shortDate(date)}</span>
                <div className="ab-warns">{warnEls}</div>
              </div>
              {BOARD_BRANCHES.map((br) => {
                const people = dayStaff?.[br.key];
                return (
                  <div key={br.key} className="ab-lane" data-day={d} data-branch={br.key}>
                    <div className="ab-staff" aria-label={`คนเข้ากะ${br.name}`}>
                      <UsersRound aria-hidden />
                      {staffLoading ? (
                        <span className="ab-faint">…</span>
                      ) : !people ? (
                        <span className="ab-faint">ยังไม่ลงกะ</span>
                      ) : !people.length ? (
                        <span className="ab-none">ไม่มีคนเข้ากะ</span>
                      ) : (
                        people.map((p) => (
                          <span key={p.code} className="ab-person" title={`${p.name} ${p.start}–${p.end}`}>
                            {p.name} <small>{p.start}–{p.end}</small>
                          </span>
                        ))
                      )}
                    </div>
                    {sortEvents(events.filter((e) => e.day === d && e.branch === br.key)).map((e) => (
                      <EventCard key={e.id} e={e} flag={flags[e.id]} canEdit={canEdit} onGrip={onGripDown} onOpen={() => setEditing({ event: e, isNew: false })} />
                    ))}
                    {canEdit ? (
                      <button type="button" className="ab-add" onClick={() => openNew(d, br.key)}>
                        + เพิ่ม
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {warnings.length ? <div className="ab-mwarn">{warnEls}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="ab-legend">
        {(Object.keys(GAMES) as GameKey[]).map((k) => (
          <span key={k} data-game={k}><i />{GAMES[k].name}</span>
        ))}
        <span className="is-ended"><i />จบแคมเปญแล้ว</span>
      </div>

      {editing ? (
        <EditSheet
          initial={editing.event}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(y) => {
            setEditing(null);
            commit(editing.isNew ? [...events, y] : events.map((z) => (z.id === y.id ? y : z)));
            say(editing.isNew ? "เพิ่มกิจกรรมแล้ว" : "บันทึกแล้ว");
          }}
          onDelete={() => {
            setEditing(null);
            commit(events.filter((z) => z.id !== editing.event.id));
            say(`ลบ ${editing.event.title} แล้ว · กดย้อนกลับได้`);
          }}
          onDuplicate={() => {
            setEditing(null);
            commit([...events, { ...editing.event, id: uid() }]);
            say("ทำสำเนาแล้ว");
          }}
        />
      ) : null}

      {dialog === "reset" ? (
        <Modal title="กลับไปใช้ตารางตั้งต้น?" onClose={() => setDialog(null)}>
          <p className="ab-help">ที่ย้ายหรือแก้ไว้จะกลับเป็นตารางตั้งต้น ถ้าเปลี่ยนใจกดย้อนกลับได้</p>
          <div className="ab-actions">
            <span className="ab-spacer" />
            <button type="button" className="ab-btn" onClick={() => setDialog(null)}>ยกเลิก</button>
            <button
              type="button"
              className="ab-btn ab-primary"
              onClick={() => {
                setDialog(null);
                commit(DEFAULT_BOARD);
                say("กลับไปตารางตั้งต้นแล้ว");
              }}
            >
              เริ่มใหม่
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "help" ? (
        <Modal title="วิธีใช้ตารางกิจกรรม" onClose={() => setDialog(null)}>
          <ul className="ab-help">
            <li>กดค้างที่จุดจับซ้ายการ์ด แล้วลากไปวางวันไหน สาขาไหนก็ได้</li>
            <li>แตะการ์ดเพื่อแก้เวลา ความยาว ค่าสมัคร ที่นั่ง หรือลบ</li>
            <li>แถวบนสุดของแต่ละช่อง = ใครเข้ากะสาขานั้นวันนั้น ดึงจากตารางกะจริง กดลูกศรเปลี่ยนสัปดาห์ได้</li>
            <li>แดง = เวลาชน เลยร้านปิด หรือไม่มีคนอยู่ถึงงานจบ · เหลือง = เกมเดียวกันวันเดียวกันสองสาขา · เทา = งานซ้อนในสาขาเดียว</li>
            <li>ตารางกิจกรรมซ้ำทุกสัปดาห์ แก้แล้วบันทึกเองทันที เปิดจากเครื่องอื่นเห็นตารางเดียวกัน</li>
            <li>คัดลอก = ได้ข้อความไปวางในแชทได้เลย</li>
          </ul>
          <div className="ab-actions">
            <span className="ab-spacer" />
            <button type="button" className="ab-btn ab-primary" onClick={() => setDialog(null)}>เข้าใจแล้ว</button>
          </div>
        </Modal>
      ) : null}

      {toast ? <div className="ab-toast" role="status">{toast}</div> : null}
    </section>
  );
}

function EventCard({
  e,
  flag,
  canEdit,
  onGrip,
  onOpen
}: {
  e: BoardEvent;
  flag?: "bad" | "meh";
  canEdit: boolean;
  onGrip: (ev: React.PointerEvent, id: string) => void;
  onOpen: () => void;
}) {
  const [s, en] = eventSpan(e);
  const time = e.dur ? `${fromMinutes(s)}–${fromMinutes(en)}` : "ทั้งวัน";
  const meta =
    e.game === "open"
      ? e.note || "ว่างให้เล่น / เช่าที่"
      : [e.fee ? `${e.fee}฿` : "", e.cap ? `${e.cap} ที่` : "", e.note || ""].filter(Boolean).join(" · ");
  const ended = !!e.note && /จบ/.test(e.note);
  return (
    <div className={`ab-card${flag ? ` is-${flag}` : ""}${ended ? " is-ended" : ""}`} data-game={e.game}>
      <button type="button" className="ab-grip" aria-label={`ลากเพื่อย้าย ${e.title}`} disabled={!canEdit} onPointerDown={(ev) => onGrip(ev, e.id)}>
        <GripVertical />
      </button>
      <button type="button" className="ab-cbody" onClick={onOpen} disabled={!canEdit}>
        <span className="ab-ct">{time}</span>
        <span className="ab-cg" title={e.title}>{e.title}</span>
        {meta ? <span className="ab-cf">{meta}</span> : null}
      </button>
    </div>
  );
}

const DUR_OPTIONS = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];

function EditSheet({
  initial,
  isNew,
  onClose,
  onSave,
  onDelete,
  onDuplicate
}: {
  initial: BoardEvent;
  isNew: boolean;
  onClose: () => void;
  onSave: (e: BoardEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [x, setX] = useState<BoardEvent>(initial);
  const set = <K extends keyof BoardEvent>(key: K, value: BoardEvent[K]) => setX((p) => ({ ...p, [key]: value }));
  const shift = (delta: number) => set("start", fromMinutes(Math.min(21 * 60 + 30, Math.max(OPEN_MIN, toMinutes(x.start) + delta))));

  return (
    <Modal title={isNew ? "เพิ่มกิจกรรม" : "แก้กิจกรรม"} onClose={onClose}>
      <form
        className="ab-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          onSave({ ...x, title: x.title.trim() || GAMES[x.game].name, note: x.note?.trim() || undefined });
        }}
      >
        <label className="ab-field">
          ชื่องาน
          <input value={x.title} maxLength={40} onChange={(e) => set("title", e.target.value)} required />
        </label>
        <div className="ab-grid2">
          <label className="ab-field">
            เกม
            <select
              value={x.game}
              onChange={(e) => {
                const game = e.target.value as GameKey;
                setX((p) => ({ ...p, game, ...(isNew ? { title: GAMES[game].name } : {}) }));
              }}
            >
              {(Object.keys(GAMES) as GameKey[]).map((k) => (
                <option key={k} value={k}>{GAMES[k].name}</option>
              ))}
            </select>
          </label>
          <label className="ab-field">
            สาขา
            <select value={x.branch} onChange={(e) => set("branch", e.target.value as BoardBranch)}>
              {BOARD_BRANCHES.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </label>
        </div>
        <div className="ab-grid2">
          <label className="ab-field">
            วัน
            <select value={x.day} onChange={(e) => set("day", Number(e.target.value))}>
              {BOARD_DAYS.map((D, i) => <option key={i} value={i}>{D.th}</option>)}
            </select>
          </label>
          <label className="ab-field">
            เริ่ม
            <input type="time" step={900} value={x.start} onChange={(e) => e.target.value && set("start", e.target.value)} />
          </label>
        </div>
        <div className="ab-steps">
          <button type="button" className="ab-btn" onClick={() => shift(-60)}>−1 ชม.</button>
          <button type="button" className="ab-btn" onClick={() => shift(-30)}>−30 น.</button>
          <button type="button" className="ab-btn" onClick={() => shift(30)}>+30 น.</button>
          <button type="button" className="ab-btn" onClick={() => shift(60)}>+1 ชม.</button>
        </div>
        <div className="ab-grid2">
          <label className="ab-field">
            ยาว
            <select value={x.dur} onChange={(e) => set("dur", Number(e.target.value))}>
              {DUR_OPTIONS.map((h) => <option key={h} value={h}>{h ? `${h} ชม.` : "ทั้งวัน"}</option>)}
            </select>
          </label>
          <label className="ab-field">
            ค่าสมัคร (฿)
            <input type="number" inputMode="numeric" min={0} step={10} value={x.fee} onChange={(e) => set("fee", Number(e.target.value) || 0)} />
          </label>
        </div>
        <div className="ab-grid2">
          <label className="ab-field">
            ที่นั่ง
            <input type="number" inputMode="numeric" min={0} value={x.cap} onChange={(e) => set("cap", Number(e.target.value) || 0)} />
          </label>
          <label className="ab-field">
            หมายเหตุ
            <input value={x.note || ""} maxLength={40} onChange={(e) => set("note", e.target.value)} />
          </label>
        </div>
        <div className="ab-actions">
          {!isNew ? (
            <>
              <button type="button" className="ab-btn ab-danger" onClick={onDelete}>ลบ</button>
              <button type="button" className="ab-btn" onClick={onDuplicate}>ทำสำเนา</button>
            </>
          ) : null}
          <span className="ab-spacer" />
          <button type="button" className="ab-btn" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="ab-btn ab-primary">บันทึก</button>
        </div>
      </form>
    </Modal>
  );
}
