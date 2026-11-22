"use server";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { fetchMistakes } from "../../../lib/kpi-v2-store.ts";
import { createDeal } from "../../../lib/big-deal-store.ts";
import { validateShares } from "../../../lib/big-deal.ts";
import { hasSessionSecret } from "../../../lib/session-jwt.ts";

export async function submitDeal(form: FormData) {
  const user = await requireUser(); const code = employeeCodeForEmail(user.email);
  if (!hasSessionSecret() || user.isImpersonating || !code) redirect("/big-deal?status=denied");
  const date = String(form.get("date") || ""); const receipt = String(form.get("receipt") || "").trim();
  const total = Number(form.get("total")); const note = String(form.get("note") || "").trim();
  let shares: {staffCode:string; percent:number}[] = [];
  try { shares = JSON.parse(String(form.get("shares") || "[]")); } catch { redirect("/big-deal?status=invalid"); }
  const staff = await listStaff();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || !receipt || receipt.length > 100 || !Number.isFinite(total) || total <= 0 || note.length > 500 || !Array.isArray(shares) || !validateShares(shares) || !shares.some(s => s.staffCode === code) || !shares.every(s => staff.some(p => p.active && p.code === s.staffCode))) redirect("/big-deal?status=invalid");
  try { await createDeal({ date, receipt, total, note, shares, createdBy: user.actualEmail }, await fetchMistakes()); }
  catch (e) { redirect(`/big-deal?status=${e instanceof Error && e.message === "duplicate" ? "duplicate" : "error"}`); }
  redirect("/big-deal?status=saved");
}
