import { loadTeamTargets } from "../lib/team-targets-server.ts";
import { GAMES, type Game } from "../lib/team-targets.ts";
const names: Record<Game, string> = { pokemon: "Pokémon", lorcana: "Lorcana", riftbound: "Riftbound", monsnatch: "Monsnatch" };
export async function TeamProgress() {
  try {
    const month = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    const { targets, actuals, passed, weeks } = await loadTeamTargets(month);
    if (!targets || !passed) return null;
    const total = Object.values(actuals.revenue).reduce((a, b) => a + b, 0);
    return <section className="sdoc-section"><h3>เป้าหมายทีมเดือนนี้</h3><p>ยอดขาย {targets.revenueTarget > 0 ? `${Math.round(total / targets.revenueTarget * 100)}% ของเป้า` : "ยังไม่ตั้งเป้า"}</p><ul>{GAMES.filter(g => targets.eventTargets[g] > 0).map(g => <li key={g}>{names[g]}: {passed[g]} / {weeks.length} สัปดาห์ผ่านเป้า</li>)}</ul></section>;
  } catch { return null; }
}
