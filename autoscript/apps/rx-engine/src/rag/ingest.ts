import type { LlmClient } from "../llm/client.js";
import { ensureRagSchema, toVectorLiteral, type RagPool } from "./db.js";
import { chunkDocument, loadReferenceDocuments } from "./references.js";

export interface IngestResult {
  documents: number;
  chunks: number;
  embedded: number;
  /** Chunks that carry a section heading (null for text before the first heading). */
  withSection: number;
}

/** Ingest references/*.md into reference_documents + reference_chunks. Idempotent per document id. */
export async function ingestReferences(pool: RagPool, llm: LlmClient, opts: { dir?: string; embeddingModel?: string | null; log?: (msg: string) => void } = {}): Promise<IngestResult> {
  const log = opts.log ?? (() => undefined);
  await ensureRagSchema(pool);
  const docs = await loadReferenceDocuments(opts.dir);
  let chunkCount = 0;
  let embeddedCount = 0;
  let withSection = 0;
  for (const doc of docs) {
    const chunks = chunkDocument(doc.body);
    const vectors = (await llm.embed(chunks.map((c) => c.content))) ?? [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO reference_documents (id, title, source, url, publisher, year, kind, file_name, ingested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, source=EXCLUDED.source, url=EXCLUDED.url, publisher=EXCLUDED.publisher,
           year=EXCLUDED.year, kind=EXCLUDED.kind, file_name=EXCLUDED.file_name, ingested_at=now()`,
        [doc.id, doc.title, doc.source, doc.url, doc.publisher, doc.year, doc.kind, doc.fileName],
      );
      await client.query(`DELETE FROM reference_chunks WHERE document_id = $1`, [doc.id]);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vector = vectors[i];
        await client.query(
          `INSERT INTO reference_chunks (id, document_id, ordinal, section, content, embedding, embedding_model) VALUES ($1,$2,$3,$4,$5,$6::vector,$7)`,
          [`${doc.id}#${i + 1}`, doc.id, i + 1, chunk.section, chunk.content, vector ? toVectorLiteral(vector) : null, vector ? (opts.embeddingModel ?? null) : null],
        );
        chunkCount += 1;
        if (chunk.section) withSection += 1;
        if (vector) embeddedCount += 1;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    log(`ingested ${doc.id} (${chunks.length} chunks, ${chunks.filter((c) => c.section).length} with section${vectors.length ? ", embedded" : ", lexical only"})`);
  }
  return { documents: docs.length, chunks: chunkCount, embedded: embeddedCount, withSection };
}
