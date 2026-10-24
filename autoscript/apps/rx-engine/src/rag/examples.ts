import type { SimilarCase } from "@autoscript/shared";
import type { LlmClient } from "../llm/client.js";
import { toVectorLiteral, type RagPool } from "./db.js";

/** A retrieved labelled example: what the prompt shows and what the report records (plus the summary text). */
export interface RetrievedExample extends SimilarCase {
  summary: string;
}

interface ExampleRow {
  id: string;
  dataset: SimilarCase["dataset"];
  scenario: string | null;
  verdict: SimilarCase["verdict"];
  reasons: string[];
  summary: string;
  score: number | null;
}

const SELECT = `SELECT e.id, e.dataset, e.scenario, e.verdict, e.reasons, e.summary`;
const DEFAULT_LIMIT = 3;
const LOOSE_TERM_MIN_LENGTH = 3;
const LOOSE_TERM_MAX = 10;

function toRetrieved(row: ExampleRow, retrieval: SimilarCase["retrieval"]): RetrievedExample {
  return {
    id: row.id,
    dataset: row.dataset,
    scenario: row.scenario,
    verdict: row.verdict,
    reasons: row.reasons ?? [],
    summary: row.summary,
    score: row.score == null ? null : Number(row.score),
    retrieval,
  };
}

/** Number of example cases available (0 means the examples ingest has not run). */
export async function countExamples(pool: RagPool): Promise<number> {
  const res = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM case_examples`);
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Similar labelled cases for a prescription: pgvector cosine when the query embeds and the
 * table has embeddings, otherwise Postgres full-text (same fallback order as reference chunks).
 */
export async function searchExamples(pool: RagPool, llm: LlmClient, queryText: string, k = DEFAULT_LIMIT): Promise<RetrievedExample[]> {
  const cleaned = queryText.replace(/\s+/g, " ").trim();
  if (!cleaned || k <= 0) return [];

  const embedded = await llm.embed([cleaned]);
  const vector = embedded?.[0];
  if (vector) {
    const res = await pool.query<ExampleRow>(
      `${SELECT}, 1 - (e.embedding <=> $1::vector) AS score FROM case_examples e
       WHERE e.embedding IS NOT NULL ORDER BY e.embedding <=> $1::vector LIMIT $2`,
      [toVectorLiteral(vector), k],
    );
    if (res.rows.length > 0) return res.rows.map((r) => toRetrieved(r, "VECTOR"));
  }

  const strict = await pool.query<ExampleRow>(
    `${SELECT}, ts_rank_cd(e.tsv, q) AS score FROM case_examples e, websearch_to_tsquery('english', $1) q
     WHERE e.tsv @@ q ORDER BY score DESC LIMIT $2`,
    [cleaned, k],
  );
  if (strict.rows.length > 0) return strict.rows.map((r) => toRetrieved(r, "LEXICAL"));

  const terms = [...new Set(cleaned.split(" ").filter((t) => t.length > LOOSE_TERM_MIN_LENGTH))].slice(0, LOOSE_TERM_MAX).join(" OR ");
  if (!terms) return [];
  const loose = await pool.query<ExampleRow>(
    `${SELECT}, ts_rank_cd(e.tsv, q) AS score FROM case_examples e, websearch_to_tsquery('english', $1) q
     WHERE e.tsv @@ q ORDER BY score DESC LIMIT $2`,
    [terms, k],
  );
  return loose.rows.map((r) => toRetrieved(r, "LEXICAL"));
}

/** Drop the summary text so only the recorded fields reach the report. */
export function toSimilarCase(example: RetrievedExample): SimilarCase {
  const { summary: _summary, ...rest } = example;
  return rest;
}
