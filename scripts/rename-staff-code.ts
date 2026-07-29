// Renames a staff code and moves every planner row that references it.
//
//   npx tsx scripts/rename-staff-code.ts <from> <to>           # dry run
//   npx tsx scripts/rename-staff-code.ts <from> <to> --apply
//
// schedule_shifts / schedule_actual document ids embed the staff code
// (`branch__date__staff`), so a rename means writing the row under its new id and
// deleting the old one. Only these two collections key on the code; work assignments and
// the manual KPI inputs are checked and reported so nothing is missed silently.

import { restDeleteDoc, restListCollection, restUpsertDoc } from "../lib/firestore-rest.ts";

const [from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!from || !to) {
  console.error("usage: rename-staff-code.ts <from> <to> [--apply]");
  process.exit(1);
}

type Row = Record<string, unknown> & { branch?: string; workDate?: string; staffCode?: string };

for (const collection of ["schedule_shifts", "schedule_actual"]) {
  const rows = await restListCollection<Row>(collection);
  const mine = rows.filter((row) => row.staffCode === from);
  console.log(`\n${collection}: ${mine.length} row(s) reference "${from}"`);

  for (const row of mine) {
    const oldId = `${row.branch}__${row.workDate}__${from}`;
    const newId = `${row.branch}__${row.workDate}__${to}`;
    console.log(`  ${row.workDate}  ${JSON.stringify(row.assignment ?? row.clockIn ?? "")}  ${oldId} → ${newId}`);
    if (!apply) continue;

    const { ...fields } = row;
    fields.staffCode = to;
    await restUpsertDoc(collection, newId, fields as Record<string, string | number | boolean>);
    await restDeleteDoc(collection, oldId);
  }
}

// These store the code as a plain field, so a rename would orphan them too.
for (const collection of ["work_assignments", "work_handoffs", "sop_service_records", "sop_assigned_records"]) {
  const rows = await restListCollection<Record<string, unknown>>(collection);
  const hits = rows.filter((row) => JSON.stringify(row).includes(`"${from}"`));
  if (hits.length) console.log(`\n⚠️  ${collection}: ${hits.length} row(s) also reference "${from}" — not migrated by this script`);
}

if (!apply) console.log("\nDRY RUN — nothing written. Re-run with --apply.");
