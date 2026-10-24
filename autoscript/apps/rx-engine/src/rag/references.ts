import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const REFERENCES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../references");

const FrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  source: z.string(),
  url: z.string().nullable(),
  publisher: z.string(),
  year: z.coerce.number(),
  kind: z.string(),
});

export interface ReferenceDocument extends z.infer<typeof FrontmatterSchema> {
  body: string;
  fileName: string;
}

/** Tiny YAML-subset frontmatter parser (key: value lines only). */
function parseFrontmatter(raw: string, fileName: string): ReferenceDocument {
  // Windows checkouts may carry CRLF line endings.
  const match = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${fileName}: missing frontmatter`);
  const fields: Record<string, string | null> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value === "null" || value === "" ? null : value.replace(/^"(.*)"$/, "$1");
  }
  const parsed = FrontmatterSchema.parse(fields);
  return { ...parsed, body: match[2]!.trim(), fileName };
}

export async function loadReferenceDocuments(dir = REFERENCES_DIR): Promise<ReferenceDocument[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md") && f !== "COVERAGE.md").sort();
  const docs: ReferenceDocument[] = [];
  for (const fileName of files) {
    docs.push(parseFrontmatter(await readFile(path.join(dir, fileName), "utf8"), fileName));
  }
  return docs;
}

export interface ReferenceChunk {
  /** Markdown heading in force where the chunk starts; null for text before the first heading. */
  section: string | null;
  content: string;
}

const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
export const DEFAULT_CHUNK_CHARS = 900;

/**
 * Split a document body into paragraph-based chunks of roughly `maxChars`.
 * A chunk never spans two headings, so every chunk has exactly one section.
 * Heading lines are recorded as the section and are not part of the content.
 */
export function chunkDocument(body: string, maxChars = DEFAULT_CHUNK_CHARS): ReferenceChunk[] {
  const chunks: ReferenceChunk[] = [];
  let section: string | null = null;
  let current: ReferenceChunk | null = null;
  const flush = () => {
    if (current) chunks.push(current);
    current = null;
  };

  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const heading = lines[0]!.match(HEADING);
    if (heading) {
      flush();
      section = heading[1]!;
      lines.shift();
    }
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (current && current.section === section && current.content.length + text.length + 1 <= maxChars) {
      current = { section, content: `${current.content}\n${text}` };
    } else {
      flush();
      current = { section, content: text };
    }
  }
  flush();
  return chunks;
}

/** Chunk contents only (kept for callers that do not need sections). */
export function chunkBody(body: string, maxChars = DEFAULT_CHUNK_CHARS): string[] {
  return chunkDocument(body, maxChars).map((c) => c.content);
}
