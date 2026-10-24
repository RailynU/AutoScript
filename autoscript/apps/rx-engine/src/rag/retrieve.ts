import type { EvidenceRef } from "@autoscript/shared";
import type { LlmClient } from "../llm/client.js";
import { toVectorLiteral, type RagPool } from "./db.js";
import { searchExamples, type RetrievedExample } from "./examples.js";

interface ChunkRow {
  id: string;
  document_id: string;
  section: string | null;
  content: string;
  title: string;
  source: string;
  url: string | null;
  score: number | null;
}

function toEvidence(row: ChunkRow, retrieval: EvidenceRef["retrieval"]): EvidenceRef {
  return {
    chunkId: row.id,
    documentId: row.document_id,
    title: row.title,
    source: row.source,
    url: row.url,
    section: row.section ?? null,
    excerpt: row.content,
    retrieval,
    score: row.score == null ? null : Number(row.score),
  };
}

const SELECT = `SELECT c.id, c.document_id, c.section, c.content, d.title, d.source, d.url`;
const FROM = `FROM reference_chunks c JOIN reference_documents d ON d.id = c.document_id`;

export class Retriever {
  constructor(
    private readonly pool: RagPool,
    private readonly llm: LlmClient,
  ) {}

  async documentCount(): Promise<number> {
    const res = await this.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM reference_documents`);
    return Number(res.rows[0]?.n ?? 0);
  }

  /** Labelled dataset cases similar to the prescription (illustrative only, never citable). */
  async searchExamples(query: string, k = 3): Promise<RetrievedExample[]> {
    return searchExamples(this.pool, this.llm, query, k);
  }

  /** Chunks explicitly attached by a deterministic rule (by document id). */
  async byDocumentIds(documentIds: string[]): Promise<EvidenceRef[]> {
    if (documentIds.length === 0) return [];
    const res = await this.pool.query<ChunkRow>(
      `${SELECT}, NULL::float AS score ${FROM} WHERE c.document_id = ANY($1::text[]) ORDER BY c.document_id, c.ordinal`,
      [documentIds],
    );
    return res.rows.map((r) => toEvidence(r, "RULE"));
  }

  /**
   * Similarity search. Uses pgvector cosine distance when the query can be
   * embedded and the corpus has embeddings; otherwise Postgres full-text search.
   */
  async search(query: string, limit = 4): Promise<{ results: EvidenceRef[]; method: "VECTOR" | "LEXICAL" | "NONE" }> {
    const cleaned = query.replace(/\s+/g, " ").trim();
    if (!cleaned) return { results: [], method: "NONE" };

    const embedded = await this.llm.embed([cleaned]);
    const vector = embedded?.[0];
    if (vector) {
      const res = await this.pool.query<ChunkRow>(
        `${SELECT}, 1 - (c.embedding <=> $1::vector) AS score ${FROM}
         WHERE c.embedding IS NOT NULL ORDER BY c.embedding <=> $1::vector LIMIT $2`,
        [toVectorLiteral(vector), limit],
      );
      if (res.rows.length > 0) return { results: res.rows.map((r) => toEvidence(r, "VECTOR")), method: "VECTOR" };
    }

    // Strict pass: every term must match (websearch syntax ANDs the words).
    const strict = await this.pool.query<ChunkRow>(
      `${SELECT}, ts_rank_cd(c.tsv, q) AS score ${FROM}, websearch_to_tsquery('english', $1) q
       WHERE c.tsv @@ q ORDER BY score DESC LIMIT $2`,
      [cleaned, limit],
    );
    const results = strict.rows.map((r) => toEvidence(r, "LEXICAL"));
    if (results.length >= limit) return { results, method: "LEXICAL" };

    // Top up with partial matches (terms ORed): one chunk that happens to contain every word must not
    // crowd out the documents that match most of them, which is what the caller asked `limit` for.
    const terms = cleaned.split(" ").filter((t) => t.length > 3).slice(0, 8).join(" OR ");
    if (!terms) return { results, method: "LEXICAL" };
    const seen = new Set(results.map((e) => e.chunkId));
    const loose = await this.pool.query<ChunkRow>(
      `${SELECT}, ts_rank_cd(c.tsv, q) AS score ${FROM}, websearch_to_tsquery('english', $1) q
       WHERE c.tsv @@ q ORDER BY score DESC LIMIT $2`,
      [terms, limit + seen.size],
    );
    const extra = loose.rows.map((r) => toEvidence(r, "LEXICAL")).filter((e) => !seen.has(e.chunkId));
    return { results: [...results, ...extra].slice(0, limit), method: "LEXICAL" };
  }
}

/** De-duplicate evidence by chunk id, keeping the first occurrence. */
export function dedupeEvidence(items: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return items.filter((e) => (seen.has(e.chunkId) ? false : (seen.add(e.chunkId), true)));
}

/**
 * Identity of a reference for a reader: the document and the section. Retrieval diagnostics
 * (method, score) never take part. A chunk without a section stands on its own.
 */
export function referenceKey(e: Pick<EvidenceRef, "documentId" | "section" | "chunkId">): string {
  return `${e.documentId}::${e.section ?? `chunk:${e.chunkId}`}`;
}

/**
 * One excerpt per document section, keeping the first occurrence. Callers put rule-attached
 * evidence first so that it wins over a vector/lexical hit on the same section.
 */
export function dedupeByReference(items: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return items.filter((e) => {
    const key = referenceKey(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
