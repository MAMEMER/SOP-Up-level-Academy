export function bangkokMonthRange(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3600000);
  const year = local.getUTCFullYear(), month = local.getUTCMonth();
  return { start: Date.UTC(year, month, 1) - 7 * 3600000, end: Date.UTC(year, month + 1, 1) - 7 * 3600000 };
}

export function countActiveReferrals(rows: Array<{ tier?: unknown; status?: unknown; membershipRevoked?: unknown; createdAt?: unknown }>, now = new Date()) {
  const { start, end } = bangkokMonthRange(now);
  return rows.filter(row => {
    const value = row.createdAt;
    const date = value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : value;
    const time = date instanceof Date ? date.getTime() : typeof date === "string" || typeof date === "number" ? new Date(date).getTime() : NaN;
    return Boolean(row.tier) && row.status === "active" && row.membershipRevoked !== true && time >= start && time < end;
  }).length;
}
