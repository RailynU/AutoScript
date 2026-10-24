import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDrugName } from "@autoscript/clinical-rules";
import type { ExtractedMedication, ExtractedPrescription } from "@autoscript/shared";
import { extractForDataset, type DatasetExtraction } from "../src/dataset/extractForDataset.js";
import { jpegDimensions } from "../src/dataset/jpeg.js";
import { redactDeep } from "../src/dataset/redact.js";
import { labelEntry } from "../src/dataset/rubric.js";
import { DatasetFileSchema, type DatasetEntry, type DatasetFile } from "../src/dataset/schema.js";
import { loadEnv } from "../src/env.js";
import { LlmNotConfiguredError } from "../src/llm/client.js";
import { createLlmClient } from "../src/server.js";

/**
 * Builds datasets/prescriptions/prescriptions.json from the JPGs in datasets/prescriptions/images.
 * Each image is transcribed once by the vision model (raw result cached in .cache/), then labelled
 * good/bad by the deterministic rubric. Re-running only calls the model for uncached images.
 *
 *   pnpm dataset:build            # full run
 *   pnpm dataset:build --limit 5  # smoke test
 *   pnpm dataset:build --force    # ignore the cache
 */
const DATASET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../datasets/prescriptions");
const IMAGES_DIR = path.join(DATASET_DIR, "images");
const CACHE_DIR = path.join(DATASET_DIR, ".cache");
const OUTPUT = path.join(DATASET_DIR, "prescriptions.json");
const DATASET_VERSION = "2026.10.24";
const CONCURRENCY = 4;
const ATTEMPTS = 2;

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const FORCE = args.includes("--force");

interface ImageFile { id: string; fileName: string; buffer: Buffer; sha256: string }
interface CachedResult { result: DatasetExtraction | null; error: string | null; extractedAt: string }

function numericOrder(a: string, b: string): number {
  return (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0) || a.localeCompare(b);
}

async function listImages(): Promise<ImageFile[]> {
  const names = (await readdir(IMAGES_DIR)).filter((n) => /\.jpe?g$/i.test(n)).sort(numericOrder);
  const files: ImageFile[] = [];
  for (const [i, fileName] of names.entries()) {
    const buffer = await readFile(path.join(IMAGES_DIR, fileName));
    files.push({ id: `rx-${String(i + 1).padStart(3, "0")}`, fileName, buffer, sha256: createHash("sha256").update(buffer).digest("hex") });
  }
  return files;
}

async function readCache(id: string): Promise<CachedResult | null> {
  if (FORCE) return null;
  try {
    return JSON.parse(await readFile(path.join(CACHE_DIR, `${id}.json`), "utf8")) as CachedResult;
  } catch {
    return null;
  }
}

async function writeCache(id: string, cached: CachedResult): Promise<void> {
  await writeFile(path.join(CACHE_DIR, `${id}.json`), JSON.stringify(cached, null, 2));
}

async function transcribe(llm: ReturnType<typeof createLlmClient>, file: ImageFile): Promise<CachedResult> {
  const cached = await readCache(file.id);
  if (cached && (cached.result || cached.error?.includes("schema validation"))) return cached;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const result = await extractForDataset(llm, file.fileName, file.buffer.toString("base64"));
      const fresh = { result, error: null, extractedAt: new Date().toISOString() };
      await writeCache(file.id, fresh);
      return fresh;
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`  ${file.id} attempt ${attempt} failed: ${lastError}`);
    }
  }
  const failed = { result: null, error: lastError, extractedAt: new Date().toISOString() };
  await writeCache(file.id, failed);
  return failed;
}

/**
 * Re-runs the local drug map over a cached medication so a map extension re-labels the dataset
 * without a model call. A generic the LLM guessed is kept (source "LLM") only while the local
 * map still has no answer; anything else that the map cannot resolve is UNRESOLVED.
 */
function renormalizeMedication(m: ExtractedMedication): ExtractedMedication {
  const local = normalizeDrugName(m.rawName).generic;
  if (local) return { ...m, normalizedName: local, normalizationSource: "LOCAL_MAP" };
  if (m.normalizationSource === "LLM" && m.normalizedName) return m;
  return { ...m, normalizedName: null, normalizationSource: "UNRESOLVED" };
}

function renormalize(extraction: ExtractedPrescription): ExtractedPrescription {
  return { ...extraction, medications: extraction.medications.map(renormalizeMedication) };
}

function toEntry(file: ImageFile, cached: CachedResult, duplicateOf: string | null): DatasetEntry {
  const dims = jpegDimensions(file.buffer);
  const redacted = cached.result ? redactDeep({ document: cached.result.document, extraction: renormalize(cached.result.extraction) }) : null;
  const document = redacted?.value.document ?? null;
  const extraction = redacted?.value.extraction ?? null;
  return {
    id: file.id,
    image: {
      path: `images/${file.fileName}`,
      originalFileName: file.fileName,
      sha256: file.sha256,
      bytes: file.buffer.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      mimeType: "image/jpeg",
    },
    duplicateOf,
    document,
    extraction,
    label: labelEntry(document, extraction),
    piiRedacted: redacted?.changed ?? false,
    provenance: {
      model: cached.result?.model ?? null,
      extractedAt: cached.extractedAt,
      durationMs: cached.result?.durationMs ?? null,
      error: cached.error,
    },
  };
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

function count<T>(items: T[], key: (item: T) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) for (const k of key(item)) out[k] = (out[k] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function buildFile(entries: DatasetEntry[]): DatasetFile {
  return {
    name: "autoscript-prescription-images",
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    source: "Prescriptions dataset (for training): 129 JPG prescription images supplied by the project owner; copied unchanged into images/.",
    schemaNote:
      "extraction follows @autoscript/shared ExtractedPrescriptionSchema (what the app produces for an uploaded image). label is computed by apps/rx-engine/src/dataset/rubric.ts from the extraction only; no label was authored by the LLM. humanReviewed is false everywhere until a pharmacist edits an entry.",
    stats: {
      total: entries.length,
      good: entries.filter((e) => e.label.verdict === "good").length,
      bad: entries.filter((e) => e.label.verdict === "bad").length,
      duplicates: entries.filter((e) => e.duplicateOf).length,
      extractionFailed: entries.filter((e) => e.provenance.error).length,
      byDocumentType: count(entries, (e) => [e.document?.type ?? "unknown"]),
      byIssue: count(entries, (e) => [...new Set(e.label.issues.map((i) => i.code))]),
    },
    entries,
  };
}

const env = loadEnv();
const llm = createLlmClient(env);
if (!llm.configured) throw new LlmNotConfiguredError();
await mkdir(CACHE_DIR, { recursive: true });

const files = (await listImages()).slice(0, LIMIT);
const firstByHash = new Map<string, string>();
const unique: ImageFile[] = [];
for (const f of files) {
  if (firstByHash.has(f.sha256)) continue;
  firstByHash.set(f.sha256, f.id);
  unique.push(f);
}
console.log(`${files.length} images, ${unique.length} unique, model ${llm.visionModel}`);

const results = new Map<string, CachedResult>();
let done = 0;
const started = Date.now();
await runPool(unique, async (file) => {
  const cached = await transcribe(llm, file);
  results.set(file.id, cached);
  done++;
  const r = cached.result;
  const status = r ? `${r.document.type}, ${r.extraction.medications.length} med(s), conf ${r.extraction.overallConfidence.toFixed(2)}` : `FAILED: ${cached.error}`;
  console.log(`[${done}/${unique.length}] ${file.id} (${file.fileName}) ${status}`);
});

const entries = files.map((f) => {
  const canonical = firstByHash.get(f.sha256)!;
  return toEntry(f, results.get(canonical)!, canonical === f.id ? null : canonical);
});
const dataset = DatasetFileSchema.parse(buildFile(entries));
await writeFile(OUTPUT, JSON.stringify(dataset, null, 2));
console.log(`Wrote ${OUTPUT} in ${Math.round((Date.now() - started) / 1000)} s`);
console.log(JSON.stringify(dataset.stats, null, 2));
