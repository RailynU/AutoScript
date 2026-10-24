import type { AnalysisReport, AnalyzeRequest, EngineCallback } from "@autoscript/shared";
import { scoreExtraction } from "../dataset/us/score.js";
import type { LlmClient } from "../llm/client.js";
import { runPipeline, type PipelineDeps } from "../pipeline.js";
import type { RagPool } from "../rag/db.js";
import { Retriever } from "../rag/retrieve.js";
import { SYSTEM_ORIGIN } from "./families.js";
import {
  evidenceCoverage,
  evidenceSections,
  forbiddenWording,
  matchFamilies,
  missingLimitations,
  observedTherapyContexts,
  ruleFindings,
  supportedObservations,
  unsupportedObservations,
} from "./metrics.js";
import { OracleLlm } from "./oracle.js";
import type { CaseResult, EvalCase, EvalMode } from "./types.js";

export interface RunDeps {
  pool: RagPool;
  /** The production client in "llm" mode; ignored in "oracle" mode, where each case gets its own OracleLlm. */
  llm: LlmClient | null;
}

export interface RunOptions {
  mode: EvalMode;
  concurrency: number;
  timeoutMs: number;
  onCaseDone?: (result: CaseResult, done: number, total: number) => void;
}

/** A callback URL the pipeline never posts to: the eval captures callbacks in-process (see `send` below). */
const EVAL_CALLBACK_URL = "http://eval.invalid/callback";

/** Everything the scorer needs from one pipeline run; pure to score, so tests can feed it directly. */
export interface PipelineOutcome {
  report: AnalysisReport | null;
  error: string | null;
  durationMs: number;
  logs: string[];
}

function emptyResult(c: EvalCase, outcome: PipelineOutcome): CaseResult {
  return {
    id: c.id,
    title: c.title,
    set: c.set,
    scenario: c.scenario,
    style: c.style,
    difficulty: c.difficulty,
    status: "error",
    error: outcome.error ?? "pipeline returned no report",
    durationMs: outcome.durationMs,
    logs: outcome.logs,
    disposition: null,
    dispositionReason: null,
    expectedDisposition: c.expected.disposition,
    dispositionMatch: null,
    manualReview: null,
    firedOrigins: [],
    systemLimitations: [],
    detection: null,
    therapyContext: { expected: c.expected.therapyContext, observed: [], match: null },
    limitations: { expected: c.expected.limitations, missing: [], match: null },
    wording: { forbidden: c.expected.forbiddenWords, deterministicHits: [], aiHits: [] },
    evidenceSections: { expectedPresent: c.expected.evidence.length, present: 0, expectedAbsent: c.expected.absentEvidence.length, violations: [] },
    evidence: { deterministicFindings: 0, withEvidence: 0, coverage: null },
    ai: { completed: null, model: null, observations: 0, supported: 0, unsupported: 0, unsupportedTitles: [], rejectedCitations: 0 },
    extraction: { extractor: null, overallConfidence: null, medications: [], score: null },
    retrievalMethod: null,
    pipelineReport: null,
  };
}

/** Pure: compare one pipeline report with the case's expectations. */
export function scoreCase(c: EvalCase, outcome: PipelineOutcome, mode: EvalMode): CaseResult {
  const base = emptyResult(c, outcome);
  const report = outcome.report;
  if (!report) return base;

  const fired = ruleFindings(report.findings).map((f) => f.origin);
  const observed = observedTherapyContexts(report.findings, c.expected.findings);
  const missing = missingLimitations(report.coverage.limitations, c.expected.limitations);
  const unsupported = unsupportedObservations(report.findings);
  // Policy: without a completed AI pass NO_FLAGS_DETECTED is unreachable, so that comparison is meaningless in oracle mode.
  const dispositionComparable = !(mode === "oracle" && c.expected.disposition === "NO_FLAGS_DETECTED");
  return {
    ...base,
    status: "ok",
    error: null,
    disposition: report.disposition,
    dispositionReason: report.dispositionReason,
    dispositionMatch: dispositionComparable ? report.disposition === c.expected.disposition : null,
    manualReview: report.disposition === "MANUAL_REVIEW_NEEDED",
    firedOrigins: fired,
    systemLimitations: report.findings.filter((f) => f.origin === SYSTEM_ORIGIN).map((f) => f.title),
    detection: matchFamilies(fired, c.expected.findings, c.expected.absent),
    therapyContext: {
      expected: c.expected.therapyContext,
      observed,
      match: c.expected.therapyContext == null || observed.length === 0 ? null : observed.every((ctx) => ctx === c.expected.therapyContext),
    },
    limitations: { expected: c.expected.limitations, missing, match: c.expected.limitations.length === 0 ? null : missing.length === 0 },
    wording: { forbidden: c.expected.forbiddenWords, ...forbiddenWording(report, c.expected.forbiddenWords) },
    evidenceSections: evidenceSections(report.findings, c.expected.findings, c.expected.evidence, c.expected.absentEvidence),
    evidence: evidenceCoverage(report.findings),
    ai: {
      completed: report.coverage.llmUsed,
      model: report.ai?.model ?? null,
      observations: report.findings.filter((f) => f.type === "AI_OBSERVATION").length,
      supported: supportedObservations(report.findings).length,
      unsupported: unsupported.length,
      unsupportedTitles: unsupported.map((f) => `${f.title} (proposed ${f.proposedSeverity ?? "?"})`),
      rejectedCitations: report.ai?.rejectedCitations.length ?? 0,
    },
    extraction: {
      extractor: report.extraction.extractor,
      overallConfidence: report.extraction.overallConfidence,
      medications: report.extraction.medications.map((m) => ({ rawName: m.rawName, normalizedName: m.normalizedName, confidence: m.confidence })),
      // An oracle extraction scores 1.0 by construction, so extraction is only measured against the real model.
      score: mode === "llm" && c.groundTruth ? scoreExtraction(c.groundTruth, report.extraction) : null,
    },
    retrievalMethod: report.coverage.retrievalMethod,
    pipelineReport: report,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Run one case through the real pipeline (same code path as POST /analyze, minus Fastify) and score it. */
export async function evaluateCase(deps: RunDeps, c: EvalCase, opts: Pick<RunOptions, "mode" | "timeoutMs">): Promise<CaseResult> {
  const logs: string[] = [];
  const record = (level: string) => (o: object, msg?: string) => logs.push(`${level}: ${msg ?? ""} ${JSON.stringify(o)}`.trim());
  const log: PipelineDeps["log"] = { info: () => undefined, warn: record("warn"), error: record("error") };
  const llm = opts.mode === "oracle" ? new OracleLlm(c.oracleExtraction) : deps.llm;
  if (!llm) throw new Error("evaluateCase: an LLM client is required in llm mode");
  let failure: string | null = null;
  const send = async (cb: EngineCallback): Promise<void> => {
    if (cb.type === "failed") failure = `${cb.stage}: ${cb.error}`;
  };
  const request: AnalyzeRequest = { prescriptionId: c.id, callbackUrl: EVAL_CALLBACK_URL, source: c.source, patient: c.patient };
  const started = Date.now();
  let report: AnalysisReport | null = null;
  let error: string | null = null;
  try {
    report = await withTimeout(runPipeline({ llm, retriever: new Retriever(deps.pool, llm), send, log }, request), opts.timeoutMs, c.id);
    if (!report) error = failure ?? "pipeline returned no report";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return scoreCase(c, { report, error, durationMs: Date.now() - started, logs }, opts.mode);
}

/** Run every case with bounded concurrency; a failing case is recorded, never aborts the run. Results keep input order. */
export async function runCases(deps: RunDeps, cases: EvalCase[], opts: RunOptions): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array<CaseResult>(cases.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < cases.length) {
      const index = next++;
      const c = cases[index]!;
      let result: CaseResult;
      try {
        result = await evaluateCase(deps, c, opts);
      } catch (err) {
        result = scoreCase(c, { report: null, error: err instanceof Error ? err.message : String(err), durationMs: 0, logs: [] }, opts.mode);
      }
      results[index] = result;
      done++;
      opts.onCaseDone?.(result, done, cases.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency, cases.length)) }, worker));
  return results;
}
