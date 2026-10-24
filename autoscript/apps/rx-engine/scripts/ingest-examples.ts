import { loadEnv } from "../src/env.js";
import { createRagPool } from "../src/rag/db.js";
import { ingestExamples } from "../src/rag/ingestExamples.js";
import { createLlmClient } from "../src/server.js";

const env = loadEnv();
const pool = createRagPool(env.DATABASE_URL);
try {
  const result = await ingestExamples(pool, createLlmClient(env), { embeddingModel: env.EMBEDDING_MODEL ?? null, log: console.log });
  console.log(`Done: ${result.ingested} example cases ingested, ${result.embedded} with embeddings, ${result.skipped} dataset entries skipped.`);
  if (result.embedded === 0) console.log("No embedding provider available: example retrieval will use Postgres full-text search (reported as LEXICAL).");
} finally {
  await pool.end();
}
