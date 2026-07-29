// One-time backfill of the June 2026 shift plan into the live planner.
//
//   npx tsx scripts/backfill-june-2026.ts          # dry run — prints what would be written
//   npx tsx scripts/backfill-june-2026.ts --apply  # writes to schedule_shifts
//
// Safe to re-run: document ids are deterministic (branch__date__staff), so a second run
// upserts the same rows rather than duplicating them. Anything written here stays
// editable in /admin/schedule.

import { june2026PlannerDocs, june2026Sheet, JUNE_2026_MONTH } from "../lib/june-2026-backfill.ts";
import { restListCollection, restUpsertDoc } from "../lib/firestore-rest.ts";

const apply = process.argv.includes("--apply");
const docs = june2026PlannerDocs();

type ShiftDoc = { workDate?: string; staffCode?: string; assignment?: string; startTime?: string };

const existing = await restListCollection<ShiftDoc>("schedule_shifts");
const existingJune = new Map(
  existing
    .filter((doc) => doc.workDate?.startsWith(JUNE_2026_MONTH))
    .map((doc) => [`${doc.workDate}__${doc.staffCode}`, doc])
);

console.log(`June 2026 rows already in schedule_shifts: ${existingJune.size}`);
console.log(`Rows to write: ${docs.length}\n`);

const staff = Object.keys(june2026Sheet);
const days = [...new Set(docs.map((doc) => Number(doc.workDate.slice(8))))].sort((a, b) => a - b);

const cell = (assignment: string, startTime?: string) => {
  if (assignment === "off") return "OFF";
  if (assignment === "leave_sick") return "ป่วย";
  if (assignment === "leave_personal") return "ลากิจ";
  return `${assignment} ${startTime}`;
};

console.log(["day".padEnd(4), ...staff.map((name) => name.padEnd(12))].join(" "));
for (const day of days) {
  const row = staff.map((name) => {
    const doc = docs.find((item) => item.staffCode === name && Number(item.workDate.slice(8)) === day);
    return (doc ? cell(doc.assignment, doc.startTime) : "-").padEnd(12);
  });
  console.log([String(day).padEnd(4), ...row].join(" "));
}

const counts = docs.reduce<Record<string, number>>((acc, doc) => {
  acc[doc.assignment] = (acc[doc.assignment] || 0) + 1;
  return acc;
}, {});
console.log(`\ntotals: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(" · ")}`);

if (!apply) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
  process.exit(0);
}

const now = new Date().toISOString();
let written = 0;
for (const doc of docs) {
  await restUpsertDoc("schedule_shifts", doc.docId, {
    branch: doc.branch,
    month: doc.month,
    workDate: doc.workDate,
    staffCode: doc.staffCode,
    assignment: doc.assignment,
    startTime: doc.startTime,
    updatedAt: now,
    updatedBy: "backfill:june-2026-sheet"
  });
  written += 1;
}
console.log(`\nwrote ${written} rows to schedule_shifts`);
