// Small GFM renderer for the Masterplan docs → HTML string. Everything is HTML-escaped
// first; only the markup produced here is emitted, and link targets are limited to
// http(s)/mailto/#anchors/same-site paths, so pasted docs can't inject script.
// Supports: headings, paragraphs, line breaks, bold/italic/strike/code, links, lists
// (nested by indent, task boxes), blockquotes, fenced code, hr, and GFM tables
// (wrapped in .mp-table-wrap so wide tables scroll inside their own box).

import { sectionWithChildren, splitSections } from "./masterplan.ts";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

/** Inline markup on ALREADY-ESCAPED text. */
function inline(escaped: string): string {
  const codes: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    // href is escaped; unescape &amp; for the check, keep it escaped in the attribute
    const safe = safeHref(href.replace(/&amp;/g, "&"));
    if (!safe) return match;
    const external = /^https?:/i.test(safe);
    return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  text = text
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+?)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+?)~~/g, "<del>$1</del>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

function inlineLine(raw: string): string {
  return inline(escapeHtml(raw));
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (row[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else current += row[i];
  }
  cells.push(current.trim());
  return cells;
}

const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function renderList(lines: string[]): string {
  // lines are all list lines (items + continuation lines), first is an item
  type Item = { indent: number; ordered: boolean; text: string; children: string[] };
  const items: Item[] = [];
  const baseIndent = (LIST_ITEM.exec(lines[0])?.[1] ?? "").length;
  for (const line of lines) {
    const match = LIST_ITEM.exec(line);
    const indent = match ? match[1].length : line.length - line.trimStart().length;
    if (match && indent <= baseIndent + 1) {
      items.push({ indent, ordered: /\d/.test(match[2]), text: match[3], children: [] });
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      if (match) last.children.push(line);
      else if (last.children.length > 0) last.children.push(line);
      else last.text += ` ${line.trim()}`;
    }
  }
  const ordered = items[0]?.ordered ?? false;
  const tag = ordered ? "ol" : "ul";
  const body = items
    .map((item) => {
      let text = item.text;
      let box = "";
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
      if (task) {
        box = `<span class="mp-md-task${task[1].trim() ? " is-done" : ""}" aria-hidden="true"></span>`;
        text = task[2];
      }
      const nested = item.children.length > 0 ? renderBlocks(dedent(item.children)) : "";
      return `<li${box ? ' class="mp-md-taskitem"' : ""}>${box}${inlineLine(text)}${nested}</li>`;
    })
    .join("");
  return `<${tag}>${body}</${tag}>`;
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, l.length - l.trimStart().length)));
}

function renderTable(header: string, sep: string, rows: string[]): string {
  const heads = splitRow(header);
  const aligns = splitRow(sep).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : "";
  });
  const cell = (tag: "th" | "td", text: string, i: number) =>
    `<${tag}${aligns[i] ? ` style="text-align:${aligns[i]}"` : ""}>${inlineLine(text)}</${tag}>`;
  const thead = `<thead><tr>${heads.map((h, i) => cell("th", h, i)).join("")}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows
        .map((row) => {
          const cells = splitRow(row);
          return `<tr>${heads.map((_h, i) => cell("td", cells[i] ?? "", i)).join("")}</tr>`;
        })
        .join("")}</tbody>`
    : "";
  return `<div class="mp-table-wrap" tabindex="0"><table>${thead}${tbody}</table></div>`;
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = /^\s{0,3}(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1].length + 1);
      out.push(`<h${level}>${inlineLine(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const header = line;
      const sep = lines[i + 1];
      const rows: string[] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(header, sep, rows));
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(body)}</blockquote>`);
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        if (!current.trim()) {
          // a blank line ends the list unless the next line is still part of it
          const next = lines[i + 1];
          if (next !== undefined && (LIST_ITEM.test(next) || /^\s{2,}\S/.test(next))) {
            i += 1;
            continue;
          }
          break;
        }
        if (LIST_ITEM.test(current) || /^\s+\S/.test(current) || body.length === 0) {
          body.push(current);
          i += 1;
          continue;
        }
        // lazy continuation of the previous item's paragraph
        if (!HEADING.test(current) && !HR.test(current) && !/^\s{0,3}(>|```|~~~)/.test(current) && !current.includes("|")) {
          body.push(`  ${current}`);
          i += 1;
          continue;
        }
        break;
      }
      out.push(renderList(body));
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !/^\s{0,3}(>|```|~~~)/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-"))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    const html = para
      .map((p, idx) => {
        const hardBreak = idx < para.length - 1 && (/ {2,}$/.test(p) || /\\$/.test(p));
        return inlineLine(p.replace(/\\$/, "").trim()) + (hardBreak ? "<br />" : "");
      })
      .join("\n");
    out.push(`<p>${html}</p>`);
  }
  return out.join("\n");
}

export function renderMarkdown(markdown: string): string {
  return renderBlocks((markdown || "").replace(/\r\n?/g, "\n").split("\n"));
}

/** Plain-text heading (strip inline markup) for TOC / labels. */
export function plainHeading(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

/** Per-section render data for the doc pages (heading plain text, raw body, body HTML). */
export function docSectionViews(markdown: string) {
  return splitSections(markdown).map((section) => ({
    index: section.index,
    level: section.level,
    heading: plainHeading(section.heading),
    body: section.body,
    html: section.body.trim() ? renderMarkdown(section.body) : ""
  }));
}

/** Sections for the AI panel's "เฉพาะหัวข้อ" picker (each includes its sub-sections). */
export function aiSections(markdown: string) {
  return splitSections(markdown)
    .filter((section) => section.index > 0 && section.level <= 3)
    .map((section) => ({ index: section.index, heading: plainHeading(section.heading), text: sectionWithChildren(markdown, section.index) }));
}
