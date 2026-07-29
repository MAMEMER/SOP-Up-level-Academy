import { restListCollection } from "../lib/firestore-rest.ts";
type S = { workDate?: string; staffCode?: string; assignment?: string; startTime?: string };
type A = { workDate?: string; staffCode?: string; clockIn?: string; leaveType?: string };
const shifts = await restListCollection<S>("schedule_shifts");
const actual = await restListCollection<A>("schedule_actual");

const planLeave = shifts.filter((s) => s.assignment?.startsWith("leave_"));
console.log("PLANNED leave in schedule_shifts:");
for (const s of planLeave.sort((a,b)=>(a.workDate||"").localeCompare(b.workDate||""))) console.log(" ", s.staffCode, s.workDate, s.assignment);

const actLeave = actual.filter((a) => a.leaveType);
console.log("\nLOGGED leave in schedule_actual:");
for (const a of actLeave.sort((x,y)=>(x.workDate||"").localeCompare(y.workDate||""))) console.log(" ", a.staffCode, a.workDate, a.leaveType);

const boom = shifts.filter((s) => s.staffCode === "Boom").sort((a,b)=>(a.workDate||"").localeCompare(b.workDate||""));
console.log("\nBoom plan rows:", boom.length);
const clock = new Set(actual.filter((a)=>a.staffCode==="Boom"&&a.clockIn).map((a)=>a.workDate));
for (const s of boom) {
  const working = s.assignment === "s1" || s.assignment === "s2";
  if (working && !clock.has(s.workDate)) console.log("  NO CLOCK-IN:", s.workDate, s.assignment, s.startTime);
}
