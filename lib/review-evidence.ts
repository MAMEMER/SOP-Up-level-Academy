// Pure helpers that turn a submitted checklist's raw string maps into things a reviewer
// can actually look at: photo URLs, links, and filled-in text. Every checklist domain
// (daily / weekly / monthly) stores evidence as strings inside a Record<string,string>
// map — photos as newline-joined Storage URLs, notes/links as plain values — under keys
// that encode the date/period + item (see lib/review-verdicts.ts callers). Rather than
// hard-code every item key of every checklist type, we walk the map generically so any
// evidence a staffer attached shows up on /manager-review.

export type ExtractedEvidence = {
  photos: string[];
  links: Array<{ label: string; url: string }>;
  texts: Array<{ label: string; value: string }>;
};

const URL_RE = /^https?:\/\/\S+$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|heic|bmp|svg)(\?|#|$)/i;

function isUrl(token: string): boolean {
  return URL_RE.test(token) || token.startsWith("data:image/");
}

function looksLikePhoto(key: string, token: string): boolean {
  const k = key.toLowerCase();
  return (
    token.startsWith("data:image/") ||
    token.includes("firebasestorage.googleapis.com") ||
    IMAGE_EXT_RE.test(token) ||
    k.includes("photo") ||
    k.includes("__photos") ||
    (k.includes("evidence") && !k.includes("link"))
  );
}

/** `2026-08-12:open-clean-photos` → `open clean photos`; strips leading date/scope prefixes. */
export function cleanEvidenceLabel(key: string): string {
  return key
    .replace(/^[dwm]-/, "")
    .replace(/^\d{4}-\d{2}-\d{2}:/, "")
    .replace(/^\d{4}-\d{2}:/, "")
    .replace(/^\d{4}-W\d{2}:/, "")
    .replace(/^\d{4}-\d{2}-\d{2}(:|$)/, "")
    .replace(/__photos/gi, " รูป")
    .replace(/[:._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const splitTokens = (value: string) =>
  value
    .split(/\n+/)
    .map((token) => token.trim())
    .filter(Boolean);

/**
 * Walks one or more string maps and classifies every non-empty value into photos / links /
 * text. Boolean-ish tick markers ("true"/checked strings) and empty values are skipped.
 */
export function extractEvidence(maps: Array<Record<string, unknown> | undefined>): ExtractedEvidence {
  const photos: string[] = [];
  const links: Array<{ label: string; url: string }> = [];
  const texts: Array<{ label: string; value: string }> = [];
  const seenPhotos = new Set<string>();

  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [key, raw] of Object.entries(map)) {
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (!value) continue;

      const tokens = splitTokens(value);
      const urlTokens = tokens.filter(isUrl);

      if (urlTokens.length && urlTokens.length === tokens.length) {
        // Pure URL field — either a photo gallery or a set of reference links.
        for (const url of urlTokens) {
          if (looksLikePhoto(key, url)) {
            if (!seenPhotos.has(url)) {
              seenPhotos.add(url);
              photos.push(url);
            }
          } else {
            links.push({ label: cleanEvidenceLabel(key) || "ลิงก์", url });
          }
        }
        continue;
      }

      // Free text (notes, summaries, counts). Skip pure tick markers.
      if (value === "true" || value === "false") continue;
      texts.push({ label: cleanEvidenceLabel(key) || key, value });
    }
  }

  return { photos, links, texts };
}

export function isImageUrl(url: string): boolean {
  return url.startsWith("data:image/") || url.includes("firebasestorage.googleapis.com") || IMAGE_EXT_RE.test(url);
}

/** Counts truthy ticks in a boolean-ish map (weekly/monthly `checked` / `ticks`). */
export function countChecked(map: Record<string, unknown> | undefined): number {
  if (!map || typeof map !== "object") return 0;
  return Object.values(map).filter((v) => v === true || v === "true").length;
}
