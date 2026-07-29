// Moves every record that keys on a staff code from one code to another.
//
//   npx tsx scripts/rename-staff-code.ts <from> <to>           # dry run
//   npx tsx scripts/rename-staff-code.ts <from> <to> --apply
//
// The staff code is the join key across the whole app, and several collections embed it
// in the document id, so a rename means rewriting each row under its new id and deleting
// the old one. Merging into a code that already has rows is safe: ids are deterministic,
// so a row for the same day overwrites rather than duplicating.
//
// Covered:
//   schedule_shifts / schedule_actual   id = branch__date__staff · field staffCode
//   sop_work_records                    id = employeeKey__scopeKey · fields employeeKey, employeeName
//   work_assignments                    field staffCode
//   work_handoffs                       fields fromStaff, toStaff, claimedBy
//   sop_stock_checks / sop_service_records / sop_assigned_records
//                                       field employeeName, which also sits inside the id

import { restDeleteDoc, restListCollection, restUpsertDoc } from "../lib/firestore-rest.ts";

const [from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!from || !to) {
  console.error("usage: rename-staff-code.ts <from> <to> [--apply]");
  process.exit(1);
}

type Row = Record<string, unknown>;
type Field = string | number | boolean;

let moved = 0;

async function move(
  collection: string,
  rows: Row[],
  oldId: (row: Row) => string,
  newId: (row: Row) => string,
  patch: (row: Row) => Row
) {
  if (!rows.length) return;
  console.log(`\n${collection}: ${rows.length} row(s)`);
  for (const row of rows) {
    const before = oldId(row);
    const after = newId(row);
    console.log(`  ${before} → ${after}`);
    if (!apply) continue;
    await restUpsertDoc(collection, after, patch(row) as Record<string, Field>);
    if (after !== before) await restDeleteDoc(collection, before);
    moved += 1;
  }
}

// ── planner: the code is part of the document id ─────────────────────────────
for (const collection of ["schedule_shifts", "schedule_actual"]) {
  const rows = (await restListCollection<Row>(collection)).filter((row) => row.staffCode === from);
  await move(
    collection,
    rows,
    (row) => `${row.branch}__${row.workDate}__${from}`,
    (row) => `${row.branch}__${row.workDate}__${to}`,
    (row) => ({ ...row, staffCode: to })
  );
}

// ── checklist history: employeeKey is the code and prefixes the id ───────────
{
  const rows = (await restListCollection<Row>("sop_work_records")).filter((row) => row.employeeKey === from);
  await move(
    "sop_work_records",
    rows,
    (row) => `${from}__${row.scopeKey}`,
    (row) => `${to}__${row.scopeKey}`,
    (row) => ({ ...row, employeeKey: to, employeeName: row.employeeName === from ? to : row.employeeName })
  );
}

// ── assignments and handoffs: the code is a plain field, the id is unrelated ──
{
  const assignments = (await restListCollection<Row>("work_assignments")).filter((row) => row.staffCode === from);
  await move("work_assignments", assignments, (row) => String(row.id), (row) => String(row.id), (row) => ({ ...row, staffCode: to }));

  const handoffs = (await restListCollection<Row>("work_handoffs")).filter(
    (row) => row.fromStaff === from || row.toStaff === from || row.claimedBy === from
  );
  await move("work_handoffs", handoffs, (row) => String(row.id), (row) => String(row.id), (row) => ({
    ...row,
    fromStaff: row.fromStaff === from ? to : row.fromStaff,
    toStaff: row.toStaff === from ? to : row.toStaff,
    claimedBy: row.claimedBy === from ? to : row.claimedBy
  }));
}

// ── manual KPI inputs: stored as employeeName, which also sits inside the id ──
for (const collection of ["sop_stock_checks", "sop_service_records", "sop_assigned_records"]) {
  const rows = (await restListCollection<Row>(collection)).filter((row) => row.employeeName === from);
  await move(
    collection,
    rows,
    (row) => String(row.id),
    (row) => String(row.id).split(from).join(to),
    (row) => ({ ...row, employeeName: to, id: String(row.id).split(from).join(to) })
  );
}

console.log(apply ? `\nmoved ${moved} row(s) from "${from}" to "${to}"` : `\nDRY RUN — nothing written. Re-run with --apply.`);
