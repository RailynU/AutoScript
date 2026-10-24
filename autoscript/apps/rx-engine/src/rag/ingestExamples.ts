import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmClient } from "../llm/client.js";
import { DatasetFileSchema } from "../dataset/schema.js";
import { UsDatasetFileSchema } from "../dataset/us/schema.js";
import { ensureRagSchema, toVectorLiteral, type RagPool } from "./db.js";
import { isUsableRxEntry, rxEntryToExample, usEntryToExample, type CaseExampleInput } from "./exampleCases.js";

const DATASETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../datasets");
export const US_DATASET_FILE = path.join(DATASETS_DIR, "us-synthetic", "prescriptions.json");
export const RX_DATASET_FILE = path.join(DATASETS_DIR, "prescriptions", "prescriptions.json");

/** Embedding providers cap request size; 32 summaries of ~1 KB each stays well under typical limits. */
const EMBED_BATCH_SIZE = 32;

export interface IngestExamplesResult {
  ingested: number;
  embedded: number;
  /** Dataset entries left out because they are not usable examples (not a prescription, no extraction, duplicate image). */
  skipped: number;
}

export interface LoadedExamples {
  inputs: CaseExampleInput[];
  skipped: number;
}

/** Read both dataset files and map them to example inputs. Pure apart from the file reads. */
export async function loadExampleInputs(files: { us?: string; rx?: string } = {}): Promise<LoadedExamples> {
  const us = UsDatasetFileSchema.parse(JSON.parse(await readFile(files.us ?? US_DATASET_FILE, "utf8")));
  const rx = DatasetFileSchema.parse(JSON.parse(await readFile(files.rx ?? RX_DATASET_FILE, "utf8")));
  const usable = rx.entries.filter(isUsableRxEntry);
  return {
    inputs: [...us.entries.map(usEntryToExample), ...usable.map(rxEntryToExample)],
    skipped: rx.entries.length - usable.length,
  };
}

async function embedAll(llm: LlmClient, inputs: CaseExampleInput[]): Promise<Array<number[] | null>> {
  const vectors: Array<number[] | null> = [];
  for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
    const embedded = await llm.embed(batch.map((b) => b.summary));
    vectors.push(...batch.map((_, j) => embedded?.[j] ?? null));
  }
  return vectors;
}

/**
 * Upsert example cases into case_examples (idempotent by id) and embed their summaries when a provider is available.
 * `inputs` overrides the dataset files (used by tests with a tiny fixture).
 */
export async function ingestExamples(
  pool: RagPool,
  llm: LlmClient,
  opts: { inputs?: CaseExampleInput[]; skipped?: number; embeddingModel?: string | null; log?: (msg: string) => void } = {},
): Promise<IngestExamplesResult> {
  const log = opts.log ?? (() => undefined);
  await ensureRagSchema(pool);
  const loaded = opts.inputs ? { inputs: opts.inputs, skipped: opts.skipped ?? 0 } : await loadExampleInputs();
  const vectors = await embedAll(llm, loaded.inputs);
  let embedded = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < loaded.inputs.length; i++) {
      const input = loaded.inputs[i]!;
      const vector = vectors[i] ?? null;
      await client.query(
        `INSERT INTO case_examples (id, dataset, scenario, verdict, reasons, summary, payload, embedding, embedding_model, ingested_at)
         VALUES ($1,$2,$3,$4,$5::text[],$6,$7::jsonb,$8::vector,$9, now())
         ON CONFLICT (id) DO UPDATE SET dataset=EXCLUDED.dataset, scenario=EXCLUDED.scenario, verdict=EXCLUDED.verdict, reasons=EXCLUDED.reasons,
           summary=EXCLUDED.summary, payload=EXCLUDED.payload, embedding=EXCLUDED.embedding, embedding_model=EXCLUDED.embedding_model, ingested_at=now()`,
        [input.id, input.dataset, input.scenario, input.verdict, input.reasons, input.summary, JSON.stringify(input.payload), vector ? toVectorLiteral(vector) : null, vector ? (opts.embeddingModel ?? null) : null],
      );
      if (vector) embedded += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  log(`ingested ${loaded.inputs.length} example cases (${embedded} embedded, ${loaded.skipped} dataset entries skipped)`);
  return { ingested: loaded.inputs.length, embedded, skipped: loaded.skipped };
}
