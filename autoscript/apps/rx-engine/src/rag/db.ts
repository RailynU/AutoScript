import pg from "pg";

export type RagPool = pg.Pool;

export function createRagPool(databaseUrl: string): RagPool {
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Reference and example tables are owned by the RX Engine (plain SQL, pgvector + tsvector).
 * Idempotent; safe to call at startup and from the ingestion scripts.
 */
export async function ensureRagSchema(pool: RagPool): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      publisher TEXT NOT NULL,
      year INT NOT NULL,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
      ordinal INT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIMENSIONS}),
      embedding_model TEXT,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    )`);
  // Additive: the heading the chunk was cut from. Existing rows get it on the next `pnpm rag:ingest`.
  await pool.query(`ALTER TABLE reference_chunks ADD COLUMN IF NOT EXISTS section TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reference_chunks_tsv_idx ON reference_chunks USING GIN (tsv)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reference_chunks_document_idx ON reference_chunks (document_id, ordinal)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS case_examples (
      id TEXT PRIMARY KEY,
      dataset TEXT NOT NULL,
      scenario TEXT,
      verdict TEXT NOT NULL,
      reasons TEXT[] NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL,
      payload JSONB NOT NULL,
      embedding vector(${EMBEDDING_DIMENSIONS}),
      embedding_model TEXT,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', summary)) STORED,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS case_examples_tsv_idx ON case_examples USING GIN (tsv)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS case_examples_dataset_verdict_idx ON case_examples (dataset, verdict)`);
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
