import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "@autoscript/clinical-rules";
import { loadEnv } from "../src/env.js";
import { CURATED_CASES } from "../src/eval/cases.js";
import { DEFAULT_EVAL_COUNT, DEFAULT_EVAL_SEED, generatedCaseSpecs } from "../src/eval/generated.js";
import { checkLeakage } from "../src/eval/leakage.js";
import { materializeCase } from "../src/eval/materialize.js";
import { aggregate } from "../src/eval/metrics.js";
import { EVAL_VERSION, renderHtml, renderMarkdown } from "../src/eval/report.js";
import { runCases } from "../src/eval/runner.js";
import type { EvalCase, EvalMode, EvalReport } from "../src/eval/types.js";
import { LlmNotConfiguredError } from "../src/llm/client.js";
import { ENGINE_VERSION } from "../src/pipeline.js";
import { createRagPool, ensureRagSchema } from "../src/rag/db.js";
import { createLlmClient } from "../src/server.js";

/**
 * Reproducible evaluation of the engine on labelled synthetic cases.
 *
 *   pnpm eval                        # curated cases + 30 generated (seed 7), real LLM, writes datasets/eval/report.{json,md,html}
 *   pnpm eval --seed 11 --count 50   # other held-out set
 *   pnpm eval --no-llm               # oracle extraction, AI pass disabled: rules, retrieval and disposition only
 *   pnpm eval --out /tmp/eval        # other output directory
 *   pnpm eval --timeout 300000 --concurrency 2
 */
const DEFAULT_OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../datasets/eval");
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 240_000;

const args = process.argv.slice(2);
const numberFlag = (name: string, fallback: number): number => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  if (!Number.isFinite(value)) throw new Error(`${name} expects a number, got "${args[i + 1]}"`);
  return value;
};
const stringFlag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const SEED = numberFlag("--seed", DEFAULT_EVAL_SEED);
const COUNT = numberFlag("--count", DEFAULT_EVAL_COUNT);
const OUT = path.resolve(stringFlag("--out", DEFAULT_OUT));
const TIMEOUT_MS = numberFlag("--timeout", DEFAULT_TIMEOUT_MS);
const CONCURRENCY = numberFlag("--concurrency", DEFAULT_CONCURRENCY);
const MODE: EvalMode = args.includes("--no-llm") ? "oracle" : "llm";

const env = loadEnv();
const llm = MODE === "llm" ? createLlmClient(env) : null;
if (llm && !llm.configured) {
  console.error("LLM_API_KEY is not set. Run with --no-llm for a deterministic-only evaluation, or set the key in .env.");
  throw new LlmNotConfiguredError();
}

const pool = createRagPool(env.DATABASE_URL);
await ensureRagSchema(pool);
await mkdir(path.join(OUT, "images"), { recursive: true });

try {
  const specs = [...CURATED_CASES, ...generatedCaseSpecs(SEED, COUNT)];
  const cases: EvalCase[] = [];
  for (const spec of specs) {
    const { evalCase, png } = await materializeCase(spec);
    if (png) await writeFile(path.join(OUT, "images", `${spec.id}.png`), png);
    cases.push(evalCase);
  }
  console.log(`Prepared ${cases.length} cases (${CURATED_CASES.length} curated, ${cases.length - CURATED_CASES.length} generated, seed ${SEED}); mode ${MODE}`);

  const leakage = await checkLeakage(pool, cases);
  console.log(`Leakage check: ${leakage.checked ? (leakage.clean ? "clean" : "COLLISIONS") : "not verified"} — ${leakage.note}`);
  if (leakage.checked && !leakage.clean) {
    throw new Error(`eval cases collide with ingested examples: ${[...leakage.idCollisions, ...leakage.sha256Collisions, ...leakage.groundTruthCollisions].join(", ")}`);
  }

  const started = Date.now();
  const results = await runCases({ pool, llm }, cases, {
    mode: MODE,
    concurrency: CONCURRENCY,
    timeoutMs: TIMEOUT_MS,
    onCaseDone: (r, done, total) => {
      const d = r.detection;
      const summary = r.status === "error" ? `ERROR ${r.error}` : `${r.disposition} tp=${d?.tp} fp=${d?.fp} fn=${d?.fn} unverified=${r.ai.unsupported}${r.extraction.score ? ` extraction=${r.extraction.score.overall}` : ""}`;
      console.log(`[${done}/${total}] ${r.id} ${r.scenario} ${(r.durationMs / 1000).toFixed(1)}s ${summary}`);
    },
  });
  console.log(`Ran ${results.length} cases in ${Math.round((Date.now() - started) / 1000)} s`);

  const report: EvalReport = {
    version: EVAL_VERSION,
    generatedAt: new Date().toISOString(),
    mode: MODE,
    seed: SEED,
    generatedCount: COUNT,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    model: {
      chat: llm?.model ?? "oracle/ground-truth-extraction",
      vision: llm?.visionModel ?? "oracle/ground-truth-extraction",
      embedding: MODE === "llm" ? (env.EMBEDDING_MODEL ?? null) : null,
      observedAnalysis: [...new Set(results.map((r) => r.ai.model).filter((m): m is string => m != null))].sort(),
      observedExtractors: [...new Set(results.map((r) => r.extraction.extractor).filter((m): m is string => m != null))].sort(),
    },
    leakage,
    aggregate: aggregate(results),
    cases: results,
  };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(OUT, "report.md"), renderMarkdown(report));
  await writeFile(path.join(OUT, "report.html"), renderHtml(report));

  const a = report.aggregate;
  console.log(`\nWrote ${path.join(OUT, "report.{json,md,html}")}`);
  console.log(`cases ${a.cases.total} (ok ${a.cases.ok}, error ${a.cases.error}) | TP ${a.detection.tp} FP ${a.detection.fp} FN ${a.detection.fn} TN ${a.detection.tn}`);
  const fmt = (r: { value: number | null; numerator: number; denominator: number }) => (r.value == null ? "n/a" : `${r.value.toFixed(3)} (${r.numerator}/${r.denominator})`);
  console.log(`precision ${fmt(a.detection.precision)} | recall ${fmt(a.detection.recall)} | FNR ${fmt(a.detection.falseNegativeRate)}`);
  console.log(`disposition match ${fmt(a.disposition)} | manual review ${fmt(a.manualReview)} | evidence coverage ${fmt(a.evidence)}`);
  console.log(`AI observations supported ${a.ai.supported} / unsupported ${a.ai.unsupported} | rejected citations ${a.ai.rejectedCitations} | extraction mean ${a.extraction.meanOverall ?? "n/a"} over ${a.extraction.scored}`);
} finally {
  await pool.end();
}
