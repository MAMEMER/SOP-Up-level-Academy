// Shared owner-configurable per-item รายละเอียด (note) + ปุ่มลิงก์ (links) helpers.
//
// Every checklist editor (daily / weekly / monthly) lets the owner attach, to a single tick
// item, a free-text note ("ต้องทำอะไร / ทำยังไง") and any number of link buttons ("กดไปหน้างานจริง"
// — StoreHub, หน้า admin เว็บกิลด์, Google Sheet ฯลฯ). This file is the one place that decides
// what a valid link is and how a link with no label is displayed, so the editors and the staff
// views agree without duplicating the rule.
//
// Backward compatible by construction: an item saved before these fields existed simply has no
// note / links, and every reader below treats "missing" the same as "empty".

/** One link button on a checklist item. `label` may be empty — the display falls back to the host. */
export type ItemLink = { label: string; url: string };

/**
 * A valid link url is either an absolute https URL or an internal path starting with "/".
 * http:// (insecure), protocol-relative "//host", javascript:, mailto:, and bare text are all
 * rejected — the owner is told to fix it and the save is blocked. Kept deliberately strict so a
 * staffer never taps a button that opens something unexpected.
 */
export function isValidLinkUrl(url: string | undefined | null): boolean {
  const value = (url || "").trim();
  if (!value) return false;
  if (value.startsWith("//")) return false; // protocol-relative — reject before the "/" check
  if (value.startsWith("/")) return true; // internal path within this site
  if (!value.startsWith("https://")) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * The hostname used as the fallback label when the owner left the label blank. An internal
 * path shows as-is (e.g. "/handoff"); an https URL shows its host without a leading "www.".
 * Returns "" only when the url cannot be parsed at all.
 */
export function linkHostname(url: string | undefined | null): string {
  const value = (url || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return value;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** What the button text should read: the explicit label, else the hostname, else the raw url. */
export function linkLabel(link: ItemLink): string {
  const label = (link.label || "").trim();
  if (label) return label;
  return linkHostname(link.url) || (link.url || "").trim();
}

/**
 * Trims and validates a list of links, dropping any whose url is invalid or empty. The label is
 * kept as typed (may be ""); the display layer fills a blank label from the hostname. Run at save
 * so nothing invalid is ever persisted, and again on read so an old/hand-edited doc stays safe.
 */
export function normalizeLinks(raw: unknown): ItemLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const url = typeof (entry as { url?: unknown }).url === "string" ? (entry as { url: string }).url.trim() : "";
    if (!isValidLinkUrl(url)) continue;
    const rawLabel = typeof (entry as { label?: unknown }).label === "string" ? (entry as { label: string }).label.trim() : "";
    out.push({ label: rawLabel, url });
  }
  return out;
}

/**
 * The first link whose url the owner typed but which is NOT valid — used by an editor to block the
 * save and point at the offending row. A row with an empty url is not "invalid", it is just skipped,
 * so the owner can leave a half-typed row and still save the rest.
 */
export function firstInvalidLink(raw: unknown): ItemLink | undefined {
  if (!Array.isArray(raw)) return undefined;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const url = typeof (entry as { url?: unknown }).url === "string" ? (entry as { url: string }).url.trim() : "";
    if (url && !isValidLinkUrl(url)) {
      const label = typeof (entry as { label?: unknown }).label === "string" ? (entry as { label: string }).label : "";
      return { label, url };
    }
  }
  return undefined;
}
