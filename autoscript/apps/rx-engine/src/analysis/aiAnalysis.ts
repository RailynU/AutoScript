import { z } from "zod";
import { classifyTherapyContext, combineTherapyContexts, excludedSectionsFor, patientAgeYears, prescriptionDate, type TherapyContextResult } from "@autoscript/clinical-rules";
import {
  SEVERITY_RANK,
  Severity,
  type AiAnalysis,
  type EvidenceRef,
  type ExtractedMedication,
  type ExtractedPrescription,
  type Finding,
  type PatientContext,
  type SeveritySource,
  type SupportStatus,
} from "@autoscript/shared";
import { extractJson, type ChatMessage, type LlmClient } from "../llm/client.js";
import { toSimilarCase, type RetrievedExample } from "../rag/examples.js";
import { dedupeByReference } from "../rag/retrieve.js";

export interface AiAnalysisInput {
  extraction: ExtractedPrescription;
  patient: PatientContext | null;
  /** Deterministic findings, already carrying their RULE evidence. */
  findings: Finding[];
  /** Every chunk the model is allowed to cite (rule evidence + retrieved). */
  evidencePool: EvidenceRef[];
  /** Labelled dataset cases shown for calibration only; omitted from the prompt when empty. */
  similarCases?: RetrievedExample[];
  /** Per deterministic finding id: "documentId::section" keys that must not be attached to that finding even if the model cites them. */
  excludedSectionsByFinding?: Record<string, string[]>;
}

export interface AiAnalysisOutput {
  ai: AiAnalysis;
  /** Deterministic findings with aiContext filled, followed by AI observations. */
  findings: Finding[];
}

/** How the model classifies the basis of an additional observation. */
const RiskBasis = z.enum(["ESTABLISHED_RISK", "THEORETICAL_RISK", "MISSING_INFORMATION"]);
type RiskBasis = z.infer<typeof RiskBasis>;

const RISK_BASIS_LABEL: Record<RiskBasis, string> = {
  ESTABLISHED_RISK: "established risk",
  THEORETICAL_RISK: "theoretical risk",
  MISSING_INFORMATION: "missing information, not a confirmed risk factor",
};

const AiResponseSchema = z.object({
  summary: z.string().min(1),
  reasoning: z.string().min(1),
  findings: z
    .array(z.object({ findingId: z.string(), aiContext: z.string(), citations: z.array(z.string()).default([]) }))
    .default([]),
  additionalObservations: z
    .array(
      z.object({
        title: z.string().min(1),
        severity: Severity,
        explanation: z.string().min(1),
        riskBasis: RiskBasis.optional(),
        citations: z.array(z.string()).default([]),
        reviewQuestions: z.array(z.string()).default([]),
        medications: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  reviewQuestions: z.array(z.string()).default([]),
});

/** Severity an observation without any accepted citation is shown at. */
export const UNSUPPORTED_SEVERITY_CAP: Severity = "LOW";

/**
 * Highest severity shown for an observation by the basis the model itself assigned. A gap in the
 * record or an extrapolated risk is not a confirmed risk factor, so neither can be shown above
 * MODERATE even when a citation is accepted; the proposal stays visible in `proposedSeverity`.
 */
export const RISK_BASIS_SEVERITY_CAP: Partial<Record<RiskBasis, Severity>> = {
  MISSING_INFORMATION: "MODERATE",
  THEORETICAL_RISK: "MODERATE",
};

export const ANALYSIS_SYSTEM_PROMPT = `You are a clinical pharmacist's assistant inside a prescription review tool. You explain findings; you do not approve or reject prescriptions.

You will receive: the extracted prescription (each medication line with its THERAPY CONTEXT: ACUTE_SHORT_COURSE, CHRONIC or UNKNOWN, with the basis for that classification), the patient's available record (including age when the date of birth is known), a list of DETERMINISTIC FINDINGS produced by a rules engine (each with an id, a table severity and its therapy context), and an EVIDENCE list of reference excerpts, each with a chunk id like "doc-id#2" and the section of the source it comes from.

Return ONLY a JSON object:
{
  "summary": string,                 // 2-4 sentences for a busy pharmacist: what was prescribed, what the record shows, what needs attention
  "reasoning": string,               // your step-by-step reasoning, citing evidence ids in square brackets, e.g. [fda-warfarin-label-interactions#2]
  "findings": [                      // one entry per deterministic finding id you were given
    { "findingId": string, "aiContext": string, "citations": [string] }
  ],
  "additionalObservations": [        // ONLY things not already covered by a deterministic finding
    { "title": string, "severity": "CRITICAL"|"HIGH"|"MODERATE"|"LOW"|"INFO", "riskBasis": "ESTABLISHED_RISK"|"THEORETICAL_RISK"|"MISSING_INFORMATION", "explanation": string, "citations": [string], "reviewQuestions": [string], "medications": [string] }
  ],
  "reviewQuestions": [string]        // 3-6 concrete questions the pharmacist should resolve before dispensing
}

Hard rules:
- Cite ONLY chunk ids that appear in the EVIDENCE list. Never cite anything else. If no evidence supports a statement, say so explicitly ("no reference in the provided collection") and leave citations empty.
- Do not invent patient data, lab values, reaction histories, or label text.
- Do not state that a prescription is safe. If nothing concerning is found, say "no additional concerns within the provided evidence".
- Where information is missing or ambiguous, name the gap instead of assuming.
- Keep aiContext specific to THIS patient (age, record, documented reaction) rather than generic, and at most two sentences: it is read on a phone next to the rule's own explanation.
- Output JSON only.

Therapy context rules:
- Respect each medication's THERAPY CONTEXT. Never describe an ACUTE_SHORT_COURSE medication as chronic, long-term, ongoing or repeated exposure, and never apply a criterion that is about chronic use (for example the Beers "avoid chronic NSAID use" criterion) to a short course. For a short course, explain what the overlap during the course means and what to monitor during and after it.
- When the context is CHRONIC, say so and address sustained exposure and monitoring. When it is UNKNOWN, say the duration could not be determined and name it as a question to resolve; do not assume either way.

Evidence and severity rules:
- Keep four things apart in your wording: (1) deterministic rule matches (the findings you were given, whose severity comes from the rule table and is not yours to change) versus your own contextual observations; (2) established risks (stated in the cited evidence) versus theoretical or extrapolated risks; (3) missing information (unknown INR, unknown renal function, unverified allergy list) versus confirmed risk factors on the record. Label each additional observation with riskBasis accordingly.
- Never assign an additional observation a severity that the evidence you cite does not support. An observation with no accepted citation is shown to the pharmacist as LOW and marked UNVERIFIED regardless of the severity you propose; your proposal is kept visible.
- Age is a confirmed risk factor only when the record gives a date of birth; otherwise it is missing information.`;

interface MedicationContext {
  med: ExtractedMedication;
  context: TherapyContextResult;
}

function medicationContexts(e: ExtractedPrescription): MedicationContext[] {
  return e.medications.map((med) => ({ med, context: classifyTherapyContext(med) }));
}

function formatPatient(p: PatientContext | null, asOf: Date): string {
  if (!p) return "No patient record linked. Allergies, current medications, conditions and age are UNKNOWN (missing information, not confirmed risk factors).";
  const age = patientAgeYears(p, asOf);
  const lines = [
    `Name: ${p.firstName} ${p.lastName}; DOB: ${p.dateOfBirth ?? "unknown"}; age: ${age == null ? "unknown (no usable date of birth)" : `${age} years as of the prescription date`}; sex: ${p.sex ?? "unknown"}; weight: ${p.weightKg ?? "unknown"} kg`,
    `Allergies (${p.allergiesVerified ? "verified" : "UNVERIFIED"}): ${p.allergies.length ? p.allergies.map((a) => `${a.substance} [${a.severity}${a.reaction ? `; ${a.reaction}` : ""}${a.recordedAt ? `; recorded ${a.recordedAt}` : ""}]`).join("; ") : "none recorded"}`,
    `Conditions: ${p.conditions.length ? p.conditions.map((c) => `${c.name} (${c.status})`).join("; ") : "none recorded"}`,
    `Active medications: ${p.medications.filter((m) => m.active).length ? p.medications.filter((m) => m.active).map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` ${m.frequency}` : ""}`).join("; ") : "none recorded"}`,
  ];
  if (p.renalFunctionNote) lines.push(`Renal function note: ${p.renalFunctionNote}`);
  else lines.push("Renal function: not on record (missing information).");
  return lines.join("\n");
}

function formatExtraction(e: ExtractedPrescription, contexts: MedicationContext[]): string {
  const meds = contexts
    .map(
      ({ med: m, context }, i) =>
        `${i + 1}. ${m.rawName}${m.normalizedName ? ` (normalized: ${m.normalizedName}, via ${m.normalizationSource})` : " (NOT RECOGNIZED by normalizer)"}; strength ${m.strength ?? "?"}; sig ${m.sig ?? "?"}; frequency ${m.frequency ?? "?"}; qty ${m.quantity ?? "?"}; refills ${m.refills ?? "?"}; duration ${m.duration ?? "?"}; indication ${m.indication ?? "?"}\n   THERAPY CONTEXT: ${context.context} (${context.basis})`,
    )
    .join("\n");
  return [
    `Patient on document: ${e.patientName ?? "?"}; DOB on document: ${e.patientDateOfBirth ?? "?"}`,
    `Prescriber: ${e.prescriberName ?? "?"} (${e.prescriberIdentifier ?? "no id"}); date written: ${e.dateWritten ?? "?"}`,
    `Medications:\n${meds || "(none extracted)"}`,
    `Allergies stated on document: ${e.statedAllergies.join(", ") || "none"}`,
    `Extractor uncertainties: ${e.uncertainties.join("; ") || "none"}`,
  ].join("\n");
}

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "(none: no deterministic rule fired)";
  return findings
    .map(
      (f) =>
        `- id=${f.id} [${f.severity}, severity from rule table] ${f.title}\n  rule: ${f.origin}\n  therapy context: ${f.therapyContext ?? "UNKNOWN"}${f.therapyContextBasis ? ` (${f.therapyContextBasis})` : ""}\n  explanation: ${f.explanation}\n  rule-attached evidence: ${f.evidence.map((e) => e.chunkId).join(", ") || "none"}`,
    )
    .join("\n");
}

export const EXAMPLES_HEADING = "## EXAMPLE CASES (synthetic / dataset examples, NOT clinical evidence, NOT citable)";

function formatExamples(examples: RetrievedExample[]): string[] {
  if (examples.length === 0) return [];
  const body = examples
    .map((e) => `Example ${e.id} (dataset ${e.dataset}${e.scenario ? `, scenario ${e.scenario}` : ""}) labelled ${e.verdict.toUpperCase()}${e.reasons.length ? `; reasons: ${e.reasons.join(", ")}` : ""}\n${e.summary}`)
    .join("\n\n");
  return [
    "",
    EXAMPLES_HEADING,
    "These are labelled example prescriptions from a synthetic or photo dataset, retrieved by similarity. They are NOT facts about this patient and NOT reference evidence. Use them only to calibrate what a good or bad prescription of this kind looks like. Never cite an example id: citations must come only from the EVIDENCE list.",
    body,
  ];
}

/** Clinical fields only; retrieval method and score are diagnostics and are not shown to the model. */
function formatEvidence(pool: EvidenceRef[]): string {
  if (pool.length === 0) return "(no evidence retrieved)";
  return pool.map((e) => `[${e.chunkId}] ${e.title} — ${e.source}${e.section ? `; section: ${e.section}` : ""}\n${e.excerpt}`).join("\n\n");
}

export function buildAnalysisMessages(input: AiAnalysisInput): ChatMessage[] {
  const contexts = medicationContexts(input.extraction);
  const asOf = prescriptionDate(input.extraction.dateWritten);
  return [
    { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "## EXTRACTED PRESCRIPTION",
        formatExtraction(input.extraction, contexts),
        "",
        "## PATIENT RECORD",
        formatPatient(input.patient, asOf),
        "",
        "## DETERMINISTIC FINDINGS",
        formatFindings(input.findings),
        "",
        "## EVIDENCE (the only citable material)",
        formatEvidence(input.evidencePool),
        ...formatExamples(input.similarCases ?? []),
      ].join("\n"),
    },
  ];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `text` contains `name` as a whole word (case-insensitive), e.g. "Motrin (ibuprofen)" names "ibuprofen" and "Motrin". */
function namesMedication(text: string, name: string | null | undefined): boolean {
  if (!name) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name.trim().toLowerCase())}($|[^a-z0-9])`, "i").test(text);
}

/**
 * Therapy context of the prescribed lines an observation names; null when it names none. The model writes
 * medication names freely ("Motrin (ibuprofen)", "ibuprofen 600 mg"), so a line matches when the observation's
 * text contains its raw or normalized name as a whole word, not only when the strings are equal.
 */
function observationContext(medications: string[], contexts: MedicationContext[]): TherapyContextResult | null {
  const wanted = medications.map((m) => m.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return null;
  const matched = contexts.filter(({ med }) => wanted.some((w) => namesMedication(w, med.rawName) || namesMedication(w, med.normalizedName)));
  if (matched.length === 0) return null;
  return combineTherapyContexts(matched.map(({ med, context }) => ({ label: med.rawName, result: context })));
}

function lower(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/** Shown severity and, when it differs from the proposal, the reason. */
function shownSeverity(o: Pick<ObservationDraft, "severity" | "riskBasis">, supported: boolean): { severity: Severity; note: string } {
  if (!supported) {
    const severity = lower(o.severity, UNSUPPORTED_SEVERITY_CAP);
    return {
      severity,
      note: ` No supporting reference was found in the curated collection; treat as an unsupported model observation. Severity is shown as ${severity}${severity !== o.severity ? ` (the model proposed ${o.severity})` : ""} and the observation is marked UNVERIFIED.`,
    };
  }
  const cap = o.riskBasis ? RISK_BASIS_SEVERITY_CAP[o.riskBasis] : undefined;
  if (!cap || SEVERITY_RANK[o.severity] <= SEVERITY_RANK[cap]) return { severity: o.severity, note: "" };
  const reason = o.riskBasis === "MISSING_INFORMATION" ? "a gap in the record" : "an extrapolated risk";
  return {
    severity: cap,
    note: ` Severity is shown as ${cap} (the model proposed ${o.severity}): ${reason} is not a confirmed risk factor and is capped at ${cap}; the cited reference supports the risk mechanism, not the proposed rating.`,
  };
}

interface ObservationDraft {
  title: string;
  severity: Severity;
  explanation: string;
  riskBasis?: RiskBasis;
  reviewQuestions: string[];
  medications: string[];
}

function toObservation(o: ObservationDraft, index: number, evidence: EvidenceRef[], context: TherapyContextResult | null): Finding {
  const supported = evidence.length > 0;
  const supportStatus: SupportStatus = supported ? "SUPPORTED" : "UNVERIFIED";
  const severitySource: SeveritySource = supported ? "AI_PROPOSED" : "AI_PROPOSED_UNSUPPORTED";
  const { severity, note } = shownSeverity(o, supported);
  const basisLabel = o.riskBasis ? `; ${RISK_BASIS_LABEL[o.riskBasis]}` : "";
  return {
    id: `ai-observation-${index + 1}`,
    type: "AI_OBSERVATION",
    severity,
    title: o.title,
    explanation: `AI observation (not a deterministic rule${basisLabel}): ${o.explanation}${note}`,
    aiContext: null,
    origin: "llm",
    medications: o.medications,
    evidence,
    reviewQuestions: o.reviewQuestions,
    deterministic: false,
    therapyContext: context?.context ?? "UNKNOWN",
    therapyContextBasis: context?.basis ?? null,
    severitySource,
    supportStatus,
    proposedSeverity: o.severity,
  };
}

/** Run the LLM contextual analysis and merge it into the findings, enforcing citation grounding. */
export async function runAiAnalysis(llm: LlmClient, input: AiAnalysisInput): Promise<AiAnalysisOutput> {
  const messages = buildAnalysisMessages(input);
  const result = await llm.chatJson(messages, { maxTokens: 5000 });
  const parsed = AiResponseSchema.safeParse(extractJson(result.content));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`AI analysis output failed schema validation: ${issues}`);
  }
  const data = parsed.data;
  const poolById = new Map(input.evidencePool.map((e) => [e.chunkId, e]));
  const rejected: string[] = [];
  const resolveCitations = (ids: string[]): EvidenceRef[] => {
    const out: EvidenceRef[] = [];
    for (const id of ids) {
      const hit = poolById.get(id);
      if (hit) out.push(hit);
      else rejected.push(id);
    }
    return out;
  };

  const contextById = new Map(data.findings.map((f) => [f.findingId, f]));
  const deterministic = input.findings.map((f) => {
    const ctx = contextById.get(f.id);
    if (!ctx) return f;
    // Rule evidence first so it wins the per-reference de-duplication over a model citation of the same section.
    // A section the rule excluded for this finding (e.g. a chronic-use criterion on a short course) stays off even when cited.
    const excluded = new Set(input.excludedSectionsByFinding?.[f.id] ?? []);
    const cited = resolveCitations(ctx.citations).filter((e) => !excluded.has(`${e.documentId}::${e.section ?? ""}`));
    return { ...f, aiContext: ctx.aiContext, evidence: dedupeByReference([...f.evidence, ...cited]) };
  });

  const contexts = medicationContexts(input.extraction);
  const observations: Finding[] = data.additionalObservations.map((o, i) => {
    const context = observationContext(o.medications, contexts);
    // Same rule as for deterministic findings: a chronic-use criterion is not evidence for a short course,
    // so such a citation is dropped (the observation then counts as unsupported if nothing else backs it).
    const cited = resolveCitations(o.citations);
    const excluded = new Set(context ? excludedSectionsFor(context.context) : []);
    return toObservation(o, i, dedupeByReference(cited.filter((e) => !excluded.has(`${e.documentId}::${e.section ?? ""}`))), context);
  });

  return {
    ai: {
      model: result.model,
      summary: data.summary,
      reasoning: data.reasoning,
      reviewQuestions: data.reviewQuestions,
      rejectedCitations: [...new Set(rejected)],
      similarCases: (input.similarCases ?? []).map(toSimilarCase),
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      durationMs: result.durationMs,
    },
    findings: [...deterministic, ...observations],
  };
}
