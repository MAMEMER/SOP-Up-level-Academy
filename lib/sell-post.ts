export type SellGroup = { name: string; url: string; games: string[]; rules?: string };
export const GAMES = ["pokemon", "lorcana", "riftbound", "onepiece", "board game", "other"] as const;
export function gameForProduct(name: string): string {
  const n = name.toLowerCase();
  if (/pokemon|pokémon|โปเกมอน|โปเกม่อน|pkm/.test(n)) return "pokemon";
  if (/lorcana|ลอร์คานา/.test(n)) return "lorcana";
  if (/riftbound|ริฟต์/.test(n)) return "riftbound";
  if (/one\s*piece|วันพีซ/.test(n)) return "onepiece";
  if (/board\s*game|บอร์ดเกม/.test(n)) return "board game";
  return "other";
}
export function filterSellGroups(groups: SellGroup[], game: string): SellGroup[] {
  return groups.filter(g => g.games.some(v => v.toLowerCase().trim() === game.toLowerCase().trim()));
}
export function hasForbiddenMembershipOffer(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ");
  return /ฟรี[\s\S]{0,40}สมาชิก|สมาชิก[\s\S]{0,40}ฟรี/.test(normalized);
}
export function canGenerate(count: number, limit = 30): boolean { return Number.isInteger(count) && count >= 0 && count < limit; }
export async function generateVariants(call: (retry: boolean) => Promise<string[]>): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const variants = await call(attempt > 0);
    if (variants.length === 2 && variants.every(v => v.trim() && !hasForbiddenMembershipOffer(v))) return variants;
  }
  throw new Error("ไม่สามารถสร้างข้อความที่ผ่านการตรวจสอบได้ กรุณาลองอีกครั้ง");
}
