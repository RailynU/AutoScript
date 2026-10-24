import { decideDisposition, runRules, RULES_VERSION } from "@autoscript/clinical-rules";
import { SEVERITY_RANK, type AnalysisReport, type AnalyzeRequest, type EngineCallback, type EvidenceRef, type Finding, type ProcessingStage } from "@autoscript/shared";
import { runAiAnalysis } from "./analysis/aiAnalysis.js";
import { extractPrescription } from "./extraction/extract.js";
import { LlmNotConfiguredError, type LlmClient } from "./llm/client.js";
import { dedupeByReference, dedupeEvidence, type Retriever } from "./rag/retrieve.js";
import type { RetrievedExample } from "./rag/examples.js";

export const ENGINE_VERSION = `rx-engine/0.1.0+${RULES_VERSION}`;
const MAX_EVIDENCE_PER_FINDING = 6;

export interface PipelineDeps {
  llm: LlmClient;
  retriever: Retriever;
  /** Delivers progress / result / failure to the API. */
  send: (callback: EngineCallback) => Promise<void>;
  log: { info: (o: object, msg?: string) => void; warn: (o: object, msg?: string) => void; error: (o: object, msg?: string) => void };
}

export interface PipelineOptions {
  /** Hard deadline for the whole analysis (ANALYSIS_TIMEOUT_MS). Omit for no deadline. */
  timeoutMs?: number;
}

const STAGE_PERCENT: Record<ProcessingStage, number> = {
  QUEUED: 2,
  EXTRACTING: 10,
  NORMALIZING: 30,
  LOADING_CONTEXT: 38,
  RUNNING_RULES: 48,
  RETRIEVING_EVIDENCE: 60,
  AI_ANALYSIS: 72,
  FINALIZING: 95,
  DONE: 100,
  FAILED: 100,
};

export class AnalysisTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Analysis timed out after ${Math.round(timeoutMs / 1000)} s (ANALYSIS_TIMEOUT_MS): the LLM provider did not answer in time. Retry from the detail page.`);
    this.name = "AnalysisTimeoutError";
  }
}

function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  return b ? AbortSignal.any([a, b]) : a;
}

/** A view of `llm` whose every provider call carries `signal`, so a deadline aborts in-flight fetches. */
export function withAbortSignal(llm: LlmClient, signal: AbortSignal): LlmClient {
  return {
    configured: llm.configured,
    model: llm.model,
    visionModel: llm.visionModel,
    chatJson: (messages, opts = {}) => llm.chatJson(messages, { ...opts, signal: mergeSignals(signal, opts.signal) }),
    embed: (texts, opts = {}) => llm.embed(texts, { ...opts, signal: mergeSignals(signal, opts.signal) }),
  };
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * Run the full analysis for one prescription, reporting progress along the way.
 * With `timeoutMs`, a hung step ends in a `failed` callback at the deadline: the signal aborts
 * provider fetches made through the pipeline's LLM view, and the race guarantees the callback
 * even for a step that ignores the signal (e.g. a retriever query). After the first terminal
 * callback nothing else is sent, so a late result from an orphaned step cannot follow a failure.
 */
export async function runPipeline(deps: PipelineDeps, request: AnalyzeRequest, opts: PipelineOptions = {}): Promise<AnalysisReport | null> {
  const startedAt = new Date().toISOString();
  let stage: ProcessingStage = "QUEUED";
  let settled = false;
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(new AnalysisTimeoutError(opts.timeoutMs!)), opts.timeoutMs) : null;
  const send = async (cb: EngineCallback) => {
    if (settled) return;
    if (cb.type !== "progress") settled = true;
    await deps.send(cb);
  };
  const progress = async (next: ProcessingStage, message: string) => {
    stage = next;
    await send({ type: "progress", progress: { stage: next, message, percent: STAGE_PERCENT[next] } });
  };
  const scoped: PipelineDeps = { ...deps, llm: withAbortSignal(deps.llm, controller.signal), send };

  try {
    const report = await Promise.race([runStages(scoped, request, startedAt, progress), rejectOnAbort(controller.signal)]);
    await send({ type: "result", report });
    return report;
  } catch (err) {
    const reason: unknown = controller.signal.aborted ? controller.signal.reason : err;
    const message = reason instanceof Error ? reason.message : String(reason);
    deps.log.error({ err: message, prescriptionId: request.prescriptionId, stage }, "pipeline failed");
    await send({ type: "failed", error: message, stage });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Progress = (next: ProcessingStage, message: string) => Promise<void>;

async function runStages(deps: PipelineDeps, request: AnalyzeRequest, startedAt: string, progress: Progress): Promise<AnalysisReport> {
  if (!deps.llm.configured) throw new LlmNotConfiguredError();

  await progress("EXTRACTING", request.source.kind === "text" ? "Reading pasted prescription text" : `Reading ${request.source.mimeType === "application/pdf" ? "PDF" : "image"} with ${request.source.mimeType === "application/pdf" ? deps.llm.model : deps.llm.visionModel}`);
  const extraction = await extractPrescription(deps.llm, request.source);

  await progress("NORMALIZING", `Normalized ${extraction.medications.filter((m) => m.normalizedName).length}/${extraction.medications.length} medication names`);

  await progress("LOADING_CONTEXT", request.patient ? `Loaded record for ${request.patient.firstName} ${request.patient.lastName}: ${request.patient.allergies.length} allergies, ${request.patient.medications.length} medications` : "No patient record linked");

  await progress("RUNNING_RULES", "Running deterministic clinical rules");
  const rules = runRules({ extraction, patient: request.patient, entered: request.enteredData ?? null });

  await progress("RETRIEVING_EVIDENCE", `Retrieving references for ${rules.findings.length} finding(s)`);
  const { findings, evidencePool, method, searched, excludedSectionsByFinding } = await attachEvidence(deps.retriever, rules.findings, extraction);
  const similarCases = await retrieveSimilarCases(deps, request, extraction);

  await progress("AI_ANALYSIS", `Generating evidence-grounded explanations with ${deps.llm.model}`);
  const aiPass = await runAdvisoryAi(deps, request, { extraction, findings, evidencePool, similarCases, excludedSectionsByFinding });

  await progress("FINALIZING", "Building review report");
  const finalFindings = [...aiPass.findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const decision = decideDisposition({ findings: finalFindings, extraction, patientLinked: !!request.patient, llmCompleted: aiPass.completed });

  return {
    prescriptionId: request.prescriptionId,
    disposition: decision.disposition,
    dispositionReason: decision.reason,
    extraction,
    findings: finalFindings,
    evidence: evidencePool,
    ai: aiPass.ai,
    coverage: {
      rulesEvaluated: rules.rulesEvaluated,
      referenceDocumentsSearched: searched,
      retrievalMethod: method,
      llmUsed: aiPass.completed,
      limitations: [
        ...rules.limitations,
        method === "LEXICAL" ? "Reference retrieval used Postgres full-text search (no embedding provider configured or available)." : method === "NONE" ? "No reference documents are ingested; run `pnpm rag:ingest`." : "Reference retrieval used pgvector cosine similarity.",
      ],
    },
    engineVersion: ENGINE_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

interface AiPassInput {
  extraction: AnalysisReport["extraction"];
  findings: Finding[];
  evidencePool: EvidenceRef[];
  similarCases: RetrievedExample[];
  /** Per deterministic finding id: "documentId::section" keys the model may not cite onto that finding (set by the rule). */
  excludedSectionsByFinding: Record<string, string[]>;
}

/** The AI pass is advisory: its failure is recorded as a finding, never hidden, and forces manual review. A deadline abort is not advisory and propagates. */
async function runAdvisoryAi(deps: PipelineDeps, request: AnalyzeRequest, input: AiPassInput): Promise<{ ai: AnalysisReport["ai"]; findings: Finding[]; completed: boolean }> {
  try {
    const out = await runAiAnalysis(deps.llm, { ...input, patient: request.patient });
    return { ai: out.ai, findings: out.findings, completed: true };
  } catch (err) {
    if (err instanceof AnalysisTimeoutError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    deps.log.warn({ err: message, prescriptionId: request.prescriptionId }, "AI analysis failed; continuing with deterministic findings");
    const limitation: Finding = {
      id: "system-ai-unavailable",
      type: "SYSTEM_LIMITATION",
      severity: "MODERATE",
      title: "AI contextual analysis did not complete",
      explanation: `The language model step failed (${message.slice(0, 200)}). Deterministic findings are shown without contextual explanations, and the prescription is routed to manual review.`,
      aiContext: null,
      origin: "system",
      medications: [],
      evidence: [],
      reviewQuestions: [],
      deterministic: true,
      therapyContext: "UNKNOWN",
      therapyContextBasis: null,
      severitySource: "RULE_TABLE",
      supportStatus: null,
      proposedSeverity: null,
    };
    return { ai: null, findings: [...input.findings, limitation], completed: false };
  }
}

const SIMILAR_CASES_LIMIT = 3;

/** Query text for example retrieval: medication lines plus the patient context the rules care about. No names or dates. */
export function buildExampleQuery(extraction: AnalysisReport["extraction"], patient: AnalyzeRequest["patient"]): string {
  const meds = extraction.medications.map((m) => [m.normalizedName ?? m.rawName, m.strength, m.sig ?? m.frequency, m.quantity ? `qty ${m.quantity}` : null].filter(Boolean).join(" "));
  const context = patient
    ? [
        ...patient.allergies.map((a) => `allergy ${a.substance}`),
        ...patient.conditions.filter((c) => c.status === "ACTIVE").map((c) => c.name),
        ...patient.medications.filter((m) => m.active).map((m) => m.genericName ?? m.name),
      ]
    : [];
  return [...meds, ...extraction.statedAllergies.map((a) => `allergy ${a}`), ...context].join("; ");
}

/** Labelled examples are advisory: a retrieval failure is logged and the analysis proceeds without them. */
async function retrieveSimilarCases(deps: PipelineDeps, request: AnalyzeRequest, extraction: AnalysisReport["extraction"]): Promise<RetrievedExample[]> {
  const query = buildExampleQuery(extraction, request.patient);
  if (!query) return [];
  try {
    return await deps.retriever.searchExamples(query, SIMILAR_CASES_LIMIT);
  } catch (err) {
    deps.log.warn({ err: err instanceof Error ? err.message : String(err), prescriptionId: request.prescriptionId }, "example case retrieval failed; continuing without similar cases");
    return [];
  }
}

/** Key used by rules to name a reference section to exclude for a finding. */
const sectionKey = (e: EvidenceRef): string => `${e.documentId}::${e.section ?? ""}`;

/** Attach RULE evidence to each finding and build the citable pool (rule docs + similarity hits). */
async function attachEvidence(
  retriever: Retriever,
  ruleFindings: ReturnType<typeof runRules>["findings"],
  extraction: AnalysisReport["extraction"],
): Promise<{ findings: Finding[]; evidencePool: EvidenceRef[]; method: "VECTOR" | "LEXICAL" | "NONE"; searched: number; excludedSectionsByFinding: Record<string, string[]> }> {
  const searched = await retriever.documentCount();
  let method: "VECTOR" | "LEXICAL" | "NONE" = "NONE";
  const pool: EvidenceRef[] = [];
  const findings: Finding[] = [];
  const excludedSectionsByFinding: Record<string, string[]> = {};

  for (const rf of ruleFindings) {
    const { referenceIds, retrievalQuery, excludedSections, ...rest } = rf;
    const excluded = new Set(excludedSections ?? []);
    const allowed = (e: EvidenceRef): boolean => !excluded.has(sectionKey(e));
    const ruleChunks = (await retriever.byDocumentIds(referenceIds)).filter(allowed);
    // Interleave first, then push every preamble to the very end: a short document's disclaimer must not take a slot
    // (MAX_EVIDENCE_PER_FINDING) ahead of another cited document's substantive section.
    const ruleEvidence = preambleLast(interleaveByDocument(ruleChunks));
    const similar = await retriever.search(retrievalQuery, 3);
    if (similar.method !== "NONE") method = similar.method === "VECTOR" || method === "NONE" ? similar.method : method;
    // Rule evidence first: it wins the per-reference (document + section) de-duplication over a similarity hit on the same section.
    // Excluded sections (e.g. Beers "avoid chronic use" on a short course) are dropped from similarity hits too, not only from rule chunks.
    const evidence = dedupeByReference(dedupeEvidence([...ruleEvidence, ...similar.results.filter(allowed)])).slice(0, MAX_EVIDENCE_PER_FINDING);
    pool.push(...evidence);
    findings.push({ ...rest, evidence, aiContext: null });
    if (excluded.size > 0) excludedSectionsByFinding[rest.id] = [...excluded];
  }

  // Also retrieve general material for the medication list itself so the model has context even with zero findings.
  const medQuery = extraction.medications.map((m) => m.normalizedName ?? m.rawName).join(" ");
  if (medQuery) {
    const general = await retriever.search(medQuery, 4);
    if (general.method !== "NONE" && method === "NONE") method = general.method;
    pool.push(...general.results);
  }
  if (searched === 0) method = "NONE";
  return { findings, evidencePool: dedupeEvidence(pool), method, searched, excludedSectionsByFinding };
}

/** Text before a document's first heading (the "paraphrased summary" disclaimer) goes last, after the substantive sections. */
export function preambleLast(items: EvidenceRef[]): EvidenceRef[] {
  return [...items.filter((e) => e.section != null), ...items.filter((e) => e.section == null)];
}

/** Round-robin chunks across documents so every cited source contributes before any source repeats. */
export function interleaveByDocument(items: EvidenceRef[]): EvidenceRef[] {
  const groups = new Map<string, EvidenceRef[]>();
  for (const item of items) groups.set(item.documentId, [...(groups.get(item.documentId) ?? []), item]);
  const out: EvidenceRef[] = [];
  const queues = [...groups.values()];
  for (let i = 0; queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (q[i]) out.push(q[i]!);
  }
  return out;
}
