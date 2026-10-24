import { loadEnv } from "../src/env.js";
import { createRagPool } from "../src/rag/db.js";
import { ingestReferences } from "../src/rag/ingest.js";
import { createLlmClient } from "../src/server.js";

const env = loadEnv();
const pool = createRagPool(env.DATABASE_URL);
try {
  const result = await ingestReferences(pool, createLlmClient(env), { embeddingModel: env.EMBEDDING_MODEL ?? null, log: console.log });
  console.log(`Done: ${result.documents} documents, ${result.chunks} chunks, ${result.embedded} with embeddings.`);
  if (result.embedded === 0) console.log("No embedding provider available: retrieval will use Postgres full-text search (reported as LEXICAL in every report).");
} finally {
  await pool.end();
}
