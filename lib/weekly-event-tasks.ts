// งานกิจกรรมประจำสัปดาห์ (Weekly event) — checklist ที่พนักงานใช้บันทึกงานหลักของ "วันกิจกรรม"
// ตั้งแต่ Final ของแจก จนถึง สรุปและประกาศของรางวัล
//
// ต่างจากงาน stock/monthly: อันนี้เป็น checklist "วันจัดกิจกรรม" ของแต่ละเกม (Gym Pokémon,
// Lorcana, Rift Bound) — ใช้ logic เดียวกันทุกเกม ต่างแค่ชื่อเกม + กลุ่ม LINE
// ที่ต้องลงผล
//
// completionScope = "weekly-event" → ความคืบหน้านับจากจำนวน checklist ที่ติ๊กครบ (0/6 … 6/6)
// และ reset ทุกสัปดาห์ (ISO week) ผ่าน weekly-event-store
//
// หมายเหตุ: โพสต์ประกาศกิจกรรม + โพสต์ขอบคุณ "ไม่อยู่" ใน checklist นี้ — แยกไปเป็น Assigned work
// บน Dashboard (ที่นี่มีแค่ช่องกรอกลิงก์โพสต์ไว้อ้างอิงในใบสรุป)

export const WEEKLY_EVENT_COMPLETION_SCOPE = "weekly-event" as const;

export type WeeklyEventFieldType = "text" | "number" | "time" | "url" | "textarea";

export type WeeklyEventField = {
  key: string;
  label: string;
  type: WeeklyEventFieldType;
  placeholder?: string;
};

export type WeeklyEventChecklistItem = {
  id: string;
  title: string;
  /** กติกา/เงื่อนไขเวลา เช่น "final ก่อนกิจกรรมอย่างน้อย 1 ชั่วโมง" */
  rule?: string;
  requiredData: WeeklyEventField[];
  evidence: string[];
  hint?: string;
  /** บล็อกช่วยเหลือพิเศษใต้ item */
  extra?: "table-rule" | "pairing-link";
};

export type WeeklyEvent = {
  /** section id ที่ใช้เป็น anchor เช่น "weekly-event-gym-pokemon" */
  id: string;
  key: string;
  name: string;
  game: string;
  /** ชื่อกลุ่ม LINE ที่ต้องลงผลของเกมนี้ */
  lineGroup: string;
  schedule: string;
  /**
   * วันในสัปดาห์ที่กิจกรรมนี้จัด (0=อาทิตย์ … 6=เสาร์) — งานจะ "active"
   * และขึ้นเป็น Assigned work เฉพาะวันเหล่านี้เท่านั้น วันอื่นจะโชว์สีเทา (ยังไม่ถึงกำหนด)
   * ตรงกับตารางที่กำหนดใน /admin/schedule
   */
  activeDays: number[];
  timeWindow: string;
  completionScope: typeof WEEKLY_EVENT_COMPLETION_SCOPE;
  trainingHref: string;
  checklist: WeeklyEventChecklistItem[];
  summaryTemplate: string;
};

// กติกาจำนวนโต๊ะตามจำนวนผู้เล่น (ใช้ในขั้น "เตรียมพื้นที่เล่น")
export const seatingTableRules: { players: string; tables: string }[] = [
  { players: "6 คน", tables: "3 โต๊ะ" },
  { players: "8 คน", tables: "4 โต๊ะ" },
  { players: "10 คน", tables: "5 โต๊ะ" },
  { players: "12 คน", tables: "6 โต๊ะ" },
  { players: "เกิน 14 คน", tables: "6 โต๊ะ (นั่งร่วมกันโต๊ะละ 4 คน)" }
];

// checklist 6 ข้อ — logic เดียวกันทุกเกม (ต่างแค่ชื่อเกม + กลุ่ม LINE) จึงสร้างจาก factory
function buildChecklist(game: string, lineGroup: string): WeeklyEventChecklistItem[] {
  return [
    {
      id: "final-giveaway",
      title: "Final ของแจก",
      rule: "ต้อง final ของแจกก่อนกิจกรรมอย่างน้อย 1 ชั่วโมง",
      requiredData: [
        { key: "signups", label: "จำนวนผู้สมัคร", type: "number", placeholder: "เช่น 12" },
        { key: "giveaway_list", label: "รายการของแจก", type: "textarea", placeholder: "เช่น โปรโมพิเศษ, ซอง, ของที่ระลึก" },
        { key: "giveaway_count", label: "จำนวนของแจก", type: "number", placeholder: "เช่น 12" },
        { key: "final_time", label: "เวลาที่ final", type: "time" }
      ],
      evidence: ["รูปของแจกที่เตรียมแล้ว", "แคปรายชื่อหรือจำนวนผู้สมัคร"]
    },
    {
      id: "prepare-area",
      title: "เตรียมพื้นที่เล่น",
      rule: "ต้องเตรียมโต๊ะให้เสร็จก่อนกิจกรรม 30 นาที",
      requiredData: [
        { key: "players", label: "จำนวนผู้เล่น", type: "number", placeholder: "เช่น 10" },
        { key: "tables", label: "จำนวนโต๊ะที่จัด", type: "number", placeholder: "เช่น 5" },
        { key: "seating", label: "รูปแบบที่นั่ง", type: "text", placeholder: "เช่น โต๊ะละ 2 คน" },
        { key: "ready_time", label: "เวลาที่จัดเสร็จ", type: "time" }
      ],
      evidence: ["รูปพื้นที่แข่งขัน", "รูปโต๊ะพร้อมเลขโต๊ะ"],
      extra: "table-rule"
    },
    {
      id: "prepare-pairing",
      title: "เตรียมเว็บ pairing",
      requiredData: [
        { key: "pairing_url", label: "ลิงก์เว็บ pairing", type: "url", placeholder: "https://" },
        { key: "participants", label: "รายชื่อผู้เข้าร่วม", type: "textarea", placeholder: "1 บรรทัด 1 คน" },
        { key: "players", label: "จำนวนผู้เล่น", type: "number", placeholder: "เช่น 10" },
        { key: "signin_status", label: "สถานะลงชื่อครบหรือไม่", type: "text", placeholder: "เช่น ครบทุกคน / ขาด 1" }
      ],
      evidence: ["แคปหน้าเว็บ pairing หลังลงชื่อ"],
      hint: "เก็บลิงก์เว็บ pairing ไว้เพื่อกลับไปตรวจย้อนหลังได้",
      extra: "pairing-link"
    },
    {
      id: "start-event",
      title: "เริ่มกิจกรรม",
      requiredData: [
        { key: "start_time", label: "เวลาเริ่ม", type: "time" },
        { key: "host", label: "ผู้คุมกิจกรรม", type: "text", placeholder: "ชื่อพนักงาน" },
        { key: "ruling", label: "ปัญหาหรือ ruling ที่พบ", type: "textarea", placeholder: "ถ้าไม่มีให้ใส่ - " },
        { key: "checked_tables", label: "โต๊ะที่ตรวจแล้ว", type: "text", placeholder: "เช่น โต๊ะ 1-5" }
      ],
      evidence: ["รูปบรรยากาศเริ่มกิจกรรม", "รูปการแข่งขันบางโต๊ะ"],
      hint: "ต้องคอยตรวจสอบกฎการเล่นของแต่ละโต๊ะให้ถูกต้อง"
    },
    {
      id: "record-rounds",
      title: "บันทึกการแข่งแต่ละรอบ",
      requiredData: [
        { key: "round", label: "รอบที่", type: "text", placeholder: "เช่น รอบ 1" },
        { key: "results", label: "ผลการแข่งขัน", type: "textarea", placeholder: "สรุปผลแต่ละโต๊ะ" },
        { key: "scores", label: "คะแนน", type: "text", placeholder: "เช่น 3-0, 2-1" },
        { key: "line_post_time", label: `เวลาที่ลงผลในกลุ่ม LINE ${game}`, type: "time" }
      ],
      evidence: ["แคปผลในเว็บ pairing", `แคปข้อความลงผลในกลุ่ม LINE ${game}`],
      hint: `ต้องลงผลในกลุ่ม LINE ${game} ในแต่ละรอบ`
    },
    {
      id: "summary-awards",
      title: "สรุป และประกาศของรางวัล",
      requiredData: [
        { key: "final_rank", label: "อันดับสุดท้าย", type: "textarea", placeholder: "อันดับ 1: ___\nอันดับ 2: ___\nอันดับ 3: ___" },
        { key: "awards_given", label: "รายการรางวัลที่แจก", type: "textarea", placeholder: "รางวัลตามอันดับ" },
        { key: "followup", label: "งานที่ต้อง follow up", type: "textarea", placeholder: "ถ้าไม่มีให้ใส่ - " }
      ],
      evidence: ["รูปภาพรวมกิจกรรม", "รูปผู้ชนะหรือของรางวัล", "แคปประกาศรางวัล"],
      hint: "ต้องประกาศผลและของรางวัลตามลำดับที่จัดไว้"
    }
  ];
}

function buildSummaryTemplate(name: string): string {
  return [
    `${name} ___`,
    "วันที่: ___",
    "จำนวนผู้เล่น: ___",
    "เว็บ pairing: ___",
    "โพสต์กิจกรรม: ___",
    "โพสต์ขอบคุณ: ___",
    "อันดับ 1: ___",
    "อันดับ 2: ___",
    "อันดับ 3: ___",
    "ปัญหาที่พบ: ___"
  ].join("\n");
}

function makeEvent(params: {
  key: string;
  name: string;
  game: string;
  lineGroup: string;
  schedule: string;
  activeDays: number[];
}): WeeklyEvent {
  const id = `weekly-event-${params.key}`;
  return {
    id,
    key: params.key,
    name: params.name,
    game: params.game,
    lineGroup: params.lineGroup,
    schedule: params.schedule,
    activeDays: params.activeDays,
    timeWindow: "09:00-23:59 ของวันกิจกรรม",
    completionScope: WEEKLY_EVENT_COMPLETION_SCOPE,
    trainingHref: `/training#${id}`,
    checklist: buildChecklist(params.game, params.lineGroup),
    summaryTemplate: buildSummaryTemplate(params.name)
  };
}

export const weeklyEvents: WeeklyEvent[] = [
  makeEvent({
    key: "gym-pokemon",
    name: "Gym pokemon",
    game: "Pokemon",
    lineGroup: "กลุ่ม LINE Pokemon",
    schedule: "ทุกวันอังคาร ศุกร์ เสาร์",
    // อังคาร(2), ศุกร์(5), เสาร์(6)
    activeDays: [2, 5, 6]
  }),
  makeEvent({
    key: "lorcana",
    name: "Lorcana",
    game: "Lorcana",
    lineGroup: "กลุ่ม LINE Lorcana",
    schedule: "ทุกวันพุธ ถึง อาทิตย์",
    // พุธ(3), พฤหัส(4), ศุกร์(5), เสาร์(6), อาทิตย์(0)
    activeDays: [3, 4, 5, 6, 0]
  }),
  makeEvent({
    key: "riftbound",
    name: "Rift Bound",
    game: "Rift Bound",
    lineGroup: "กลุ่ม LINE Rift Bound",
    schedule: "ทุกวันเสาร์ อาทิตย์",
    // เสาร์(6), อาทิตย์(0) — ค่าเริ่มต้น รอ Champ ยืนยันวันจริง
    activeDays: [6, 0]
  })
];

// ชื่อวันภาษาไทย (0=อาทิตย์ … 6=เสาร์)
export const thaiWeekdayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

/** วันในสัปดาห์ของ workDate ("YYYY-MM-DD") แบบไม่โดน timezone เลื่อน (0=อาทิตย์ … 6=เสาร์) */
export function weekdayOfWorkDate(workDate: string): number {
  const [year, month, day] = workDate.split("-").map(Number);
  if (!year || !month || !day) return new Date(`${workDate}T00:00:00`).getDay();
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** งานกิจกรรมนี้ active (ถึงวันจัด) ในวัน workDate หรือไม่ */
export function isWeeklyEventActiveOn(event: WeeklyEvent, workDate: string): boolean {
  return event.activeDays.includes(weekdayOfWorkDate(workDate));
}

/** รายการงานกิจกรรมที่ active ในวัน workDate (เรียงตามลำดับเดิม) */
export function weeklyEventsActiveOn(workDate: string): WeeklyEvent[] {
  return weeklyEvents.filter((event) => isWeeklyEventActiveOn(event, workDate));
}

/** ป้ายชื่อวันที่จัดกิจกรรม เช่น "อังคาร ศุกร์ เสาร์" */
export function weeklyEventDaysLabel(event: WeeklyEvent): string {
  return event.activeDays.map((day) => thaiWeekdayNames[day]).join(" ");
}

export function weeklyEventById(id: string): WeeklyEvent | undefined {
  return weeklyEvents.find((event) => event.id === id);
}

export const weeklyEventChecklistTotal = weeklyEvents[0].checklist.length;

/** ความคืบหน้าจากจำนวน checklist ที่ติ๊กครบของ event หนึ่ง */
export function weeklyEventCompleted(event: WeeklyEvent, ticked: Record<string, boolean>): number {
  return event.checklist.filter((item) => ticked[item.id]).length;
}

/** ส่งงานได้ต่อเมื่อติ๊ก checklist ครบทุกข้อ */
export function canSubmitWeeklyEvent(event: WeeklyEvent, ticked: Record<string, boolean>): boolean {
  return weeklyEventCompleted(event, ticked) === event.checklist.length;
}

export function weeklyEventHref(eventId?: string): string {
  if (!eventId) return "/weekly-task";
  // แต่ละกิจกรรมมีหน้า checklist ของตัวเอง (/weekly-task/<key>)
  const event = weeklyEventById(eventId);
  const key = event?.key ?? eventId.replace(/^weekly-event-/, "");
  return `/weekly-task/${key}`;
}
