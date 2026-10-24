import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPrescription } from "../src/extraction/extract.js";
import { labelCase } from "../src/dataset/us/label.js";
import { renderPrescription, CANVAS_HEIGHT, CANVAS_WIDTH, type RenderDifficulty, type RenderStyle } from "../src/dataset/us/render.js";
import { createRng } from "../src/dataset/us/rng.js";
import { generateCase } from "../src/dataset/us/scenarios.js";
import { scoreExtraction } from "../src/dataset/us/score.js";
import { UsDatasetFileSchema, type UsDatasetEntry, type UsDatasetFile } from "../src/dataset/us/schema.js";
import { loadEnv } from "../src/env.js";
import { LlmNotConfiguredError } from "../src/llm/client.js";
import { createLlmClient } from "../src/server.js";

/**
 * Generates a fully synthetic US prescription image dataset with exact ground truth.
 *
 *   pnpm dataset:us                       # 120 cases, seed 20261024, no model calls
 *   pnpm dataset:us --count 40 --seed 7   # different size / seed
 *   pnpm dataset:us --extract             # also transcribe each image with the vision model and score it
 *   pnpm dataset:us --extract --limit 10  # score only the first 10
 */
const DATASET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../datasets/us-synthetic");
const IMAGES_DIR = path.join(DATASET_DIR, "images");
const CACHE_DIR = path.join(DATASET_DIR, ".cache");
const OUTPUT = path.join(DATASET_DIR, "prescriptions.json");
const GENERATOR_VERSION = "us-synthetic-2026.10.24";
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const COUNT = flag("--count", 120);
const SEED = flag("--seed", 20261024);
const LIMIT = flag("--limit", Infinity);
const EXTRACT = args.includes("--extract");
const FORCE = args.includes("--force");

interface Cached { extraction: UsDatasetEntry["extraction"]; model: string | null; extractedAt: string; error: string | null }

async function transcribe(llm: ReturnType<typeof createLlmClient>, id: string, png: Buffer, sha256: string): Promise<Cached> {
  const cachePath = path.join(CACHE_DIR, `${id}.json`);
  if (!FORCE) {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as Cached & { sha256?: string };
      if (cached.sha256 === sha256 && cached.extraction) return cached;
    } catch {
      /* no cache */
    }
  }
  let result: Cached;
  try {
    const extraction = await extractPrescription(llm, { kind: "file", fileName: `${id}.png`, mimeType: "image/png", base64: png.toString("base64") });
    result = { extraction, model: extraction.extractor, extractedAt: new Date().toISOString(), error: null };
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) throw err;
    result = { extraction: null, model: null, extractedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
  }
  await writeFile(cachePath, JSON.stringify({ ...result, sha256 }, null, 2));
  return result;
}

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i]!, i);
      }
    }),
  );
}

function count<T>(items: T[], key: (item: T) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) for (const k of key(item)) out[k] = (out[k] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function extractionStats(entries: UsDatasetEntry[]): UsDatasetFile["stats"]["extraction"] {
  const scored = entries.filter((e) => e.extractionScore);
  if (scored.length === 0) return null;
  const sum = (f: (s: NonNullable<UsDatasetEntry["extractionScore"]>) => number): number => scored.reduce((acc, e) => acc + f(e.extractionScore!), 0);
  return {
    scored: scored.length,
    meanOverall: Math.round((sum((s) => s.overall) / scored.length) * 1000) / 1000,
    medicationsMatched: sum((s) => s.medicationsMatched),
    medicationsExpected: sum((s) => s.medicationsExpected),
    patientNameMatched: sum((s) => Number(s.patientName)),
    dateMatched: sum((s) => Number(s.dateWritten)),
  };
}

await mkdir(IMAGES_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });
const rng = createRng(SEED);
const env = loadEnv();
const llm = createLlmClient(env);
if (EXTRACT && !llm.configured) throw new LlmNotConfiguredError();

const started = Date.now();
const entries: UsDatasetEntry[] = [];
for (let i = 0; i < COUNT; i++) {
  const id = `us-${String(i + 1).padStart(3, "0")}`;
  const generated = generateCase(rng, i);
  const style: RenderStyle = rng.chance(0.5) ? "printed" : "handwritten";
  const difficulty: RenderDifficulty = rng.chance(0.3) ? "noisy" : "clean";
  const png = await renderPrescription(generated.groundTruth, style, difficulty, rng);
  const fileName = `${id}.png`;
  await writeFile(path.join(IMAGES_DIR, fileName), png);
  entries.push({
    id,
    scenario: generated.scenario,
    style,
    difficulty,
    image: { path: `images/${fileName}`, sha256: createHash("sha256").update(png).digest("hex"), bytes: png.length, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png" },
    groundTruth: generated.groundTruth,
    injectedErrors: generated.injectedErrors,
    label: labelCase(generated),
    extraction: null,
    extractionScore: null,
    provenance: { seed: SEED, generatorVersion: GENERATOR_VERSION, model: null, extractedAt: null, error: null },
  });
}
console.log(`Generated ${entries.length} cases in ${Math.round((Date.now() - started) / 1000)} s (seed ${SEED})`);

if (EXTRACT) {
  const targets = entries.slice(0, LIMIT);
  let done = 0;
  await runPool(targets, async (entry) => {
    const png = await readFile(path.join(DATASET_DIR, entry.image.path));
    const cached = await transcribe(llm, entry.id, png, entry.image.sha256);
    entry.extraction = cached.extraction;
    entry.extractionScore = cached.extraction ? scoreExtraction(entry.groundTruth, cached.extraction) : null;
    entry.provenance = { ...entry.provenance, model: cached.model, extractedAt: cached.extractedAt, error: cached.error };
    done++;
    console.log(`[${done}/${targets.length}] ${entry.id} ${entry.scenario} ${entry.style}/${entry.difficulty} ${cached.error ? `FAILED: ${cached.error}` : `score ${entry.extractionScore!.overall}`}`);
  });
}

const dataset: UsDatasetFile = UsDatasetFileSchema.parse({
  name: "autoscript-us-synthetic-prescriptions",
  version: GENERATOR_VERSION,
  generatedAt: new Date().toISOString(),
  seed: SEED,
  schemaNote:
    "Fully synthetic US-style prescriptions: every patient, prescriber, clinic, NPI and DEA number is invented. groundTruth is what the image shows; label.ruleFindings is what @autoscript/clinical-rules reports for that ground truth against the patient record; injectedErrors is what the generator deliberately broke. extraction/extractionScore are filled only when built with --extract.",
  stats: {
    total: entries.length,
    good: entries.filter((e) => e.label.verdict === "good").length,
    bad: entries.filter((e) => e.label.verdict === "bad").length,
    byScenario: count(entries, (e) => [e.scenario]),
    byInjectedError: count(entries, (e) => e.injectedErrors.map((x) => x.code)),
    consistency: count(entries, (e) => [e.label.consistency]),
    extraction: extractionStats(entries),
  },
  entries,
});
await writeFile(OUTPUT, JSON.stringify(dataset, null, 2));
console.log(`Wrote ${OUTPUT}`);
console.log(JSON.stringify(dataset.stats, null, 2));
