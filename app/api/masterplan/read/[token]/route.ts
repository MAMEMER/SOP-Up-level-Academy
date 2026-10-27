import { mpStore } from "../../../../../lib/masterplan-store.ts";
import { NO_STORE_HEADERS, gateToken } from "../../../../../lib/masterplan-token-route.ts";
import { READ_CAP, docToc, readSectionText, resolveSection } from "../../../../../lib/masterplan-mcp.ts";
import { DEFAULT_DOC_TITLES, DOC_SLUGS, isDocSlug, type MpDoc } from "../../../../../lib/masterplan.ts";

// Read-only link for AIs without MCP connectors (ChatGPT, Gemini, Grok…):
//   ?doc=index                  → list of docs with their sections
//   ?doc=<slug>                 → the whole doc if ≤ 30k chars, else its table of contents
//   ?doc=<slug>&section=<n|text> → one section (capped)
// text/markdown, no-store, noindex. Same token gate + rate limit as the MCP route.

export const dynamic = "force-dynamic";

const md = (text: string, status = 200) =>
  new Response(text, { status, headers: { ...NO_STORE_HEADERS, "Content-Type": "text/markdown; charset=utf-8" } });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gate = await gateToken(token);
  if (!gate.ok) return md(gate.status === 401 ? "Unauthorized\n" : "Rate limit exceeded\n", gate.status);

  const url = new URL(request.url);
  const base = `${url.origin}${url.pathname}`;
  const slug = url.searchParams.get("doc") || "index";
  const section = url.searchParams.get("section");

  if (slug === "index") {
    const docs = await mpStore.listAll<MpDoc>("mp_docs");
    const lines = [
      `# Up Level Masterplan — ดัชนีเอกสาร`,
      `อ่านโดย: ${gate.verified.member.name} · ลิงก์นี้อ่านได้อย่างเดียว`,
      `กติกา: ห้ามแต่งตัวเลขเป้าหมายขึ้นเอง · ฉบับกลางแก้ได้ผ่านข้อเสนอในเว็บเท่านั้น`,
      ""
    ];
    for (const s of DOC_SLUGS) {
      const doc = docs.find((d) => d.slug === s);
      if (!doc) {
        lines.push(`## ${DEFAULT_DOC_TITLES[s]} (${s}) — ยังไม่ได้นำเข้า`, "");
        continue;
      }
      lines.push(`## ${doc.title} (${s}, v${doc.version}, ${doc.markdown.length} chars)`, `${base}?doc=${s}`);
      for (const t of docToc(doc.markdown).filter((t) => t.level > 0 && t.level <= 2)) {
        lines.push(`${"  ".repeat(t.level - 1)}- ${t.index}: ${t.heading} → ${base}?doc=${s}&section=${t.index}`);
      }
      lines.push("");
    }
    return md(lines.join("\n"));
  }

  if (!isDocSlug(slug)) return md("Unknown doc. Use ?doc=index\n", 404);
  const doc = await mpStore.getOne<MpDoc>("mp_docs", slug);
  if (!doc) return md("Not imported yet.\n", 404);

  if (section) {
    const index = resolveSection(doc.markdown, section);
    if (index === null) return md(`Section not found. See ${base}?doc=${slug}\n`, 404);
    return md(readSectionText(doc.markdown, index));
  }
  if (doc.markdown.length <= READ_CAP) return md(doc.markdown);
  const toc = docToc(doc.markdown)
    .map((t) => `${"  ".repeat(Math.max(0, t.level - 1))}- ${t.index}: ${t.heading} (${t.chars} chars) → ${base}?doc=${slug}&section=${t.index}`)
    .join("\n");
  return md(`# ${doc.title} (v${doc.version})\nเอกสารยาวเกิน ${READ_CAP} ตัวอักษร — เปิดทีละหัวข้อ / too long, open one section at a time:\n\n${toc}\n`);
}
