import { ALL_RULES, RULES_VERSION, runRules } from "@autoscript/clinical-rules";
import type { ExtractedPrescription } from "@autoscript/shared";
import type { DatasetIssue, DatasetLabel, DocumentProfile } from "./schema.js";

/** Below this, a document or a medication line is treated as not reliably readable. */
export const MIN_LEGIBILITY = 0.6;
export const MIN_CONFIDENCE = 0.7;

/** Rules that need a patient record are skipped: the dataset has none. */
const CONTEXT_RULE_PREFIX = "context.";
const DATASET_RULES = ALL_RULES.filter((r) => !r.id.startsWith(CONTEXT_RULE_PREFIX));
/** Rule families already covered by the rubric's own field checks. */
const RUBRIC_COVERED_RULES = ["rx.missing-fields", "rx.unresolved-drug", "rx.extraction-confidence"];
const coveredByRubric = (origin: string): boolean => RUBRIC_COVERED_RULES.some((id) => origin === id || origin.startsWith(`${id}/`));

function blocking(code: DatasetIssue["code"], detail: string): DatasetIssue {
  return { code, severity: "blocking", detail };
}
function warning(code: DatasetIssue["code"], detail: string): DatasetIssue {
  return { code, severity: "warning", detail };
}

function documentIssues(doc: DocumentProfile | null): DatasetIssue[] {
  if (!doc) return [];
  const issues: DatasetIssue[] = [];
  if (doc.type !== "prescription") issues.push(blocking("NOT_A_PRESCRIPTION", `Document classified as "${doc.type}".`));
  if (doc.legibility < MIN_LEGIBILITY) issues.push(blocking("LOW_LEGIBILITY", `Legibility ${doc.legibility.toFixed(2)} is below ${MIN_LEGIBILITY}.`));
  return issues;
}

function headerIssues(x: ExtractedPrescription): DatasetIssue[] {
  const issues: DatasetIssue[] = [];
  if (x.medications.length === 0) issues.push(blocking("NO_MEDICATIONS", "No medication line was extracted."));
  if (!x.patientName) issues.push(blocking("MISSING_PATIENT", "No patient name on the document."));
  if (!x.prescriberName) issues.push(warning("MISSING_PRESCRIBER", "No prescriber name on the document."));
  if (!x.dateWritten) issues.push(warning("MISSING_DATE", "No date written on the document."));
  if (x.overallConfidence < MIN_CONFIDENCE) {
    issues.push(blocking("LOW_EXTRACTION_CONFIDENCE", `Overall extraction confidence ${x.overallConfidence.toFixed(2)} is below ${MIN_CONFIDENCE}.`));
  }
  return issues;
}

function medicationIssues(x: ExtractedPrescription): DatasetIssue[] {
  const issues: DatasetIssue[] = [];
  for (const m of x.medications) {
    if (m.confidence < MIN_CONFIDENCE) issues.push(blocking("LOW_EXTRACTION_CONFIDENCE", `"${m.rawName}" read with confidence ${m.confidence.toFixed(2)}.`));
    if (!m.strength) issues.push(blocking("MEDICATION_MISSING_STRENGTH", `"${m.rawName}" has no strength.`));
    if (!m.sig && !m.frequency) issues.push(blocking("MEDICATION_MISSING_DIRECTIONS", `"${m.rawName}" has no directions or frequency.`));
    if (!m.quantity && !m.duration) issues.push(warning("MEDICATION_MISSING_QUANTITY", `"${m.rawName}" has no quantity or duration.`));
    if (!m.normalizedName) issues.push(warning("UNRECOGNIZED_DRUG", `"${m.rawName}" is not in the local drug map (brand or regional name?).`));
  }
  return issues;
}

/**
 * Deterministic good/bad label. "bad" when any blocking issue exists; clinical rule hits
 * (interactions, dose limits, duplicate therapy) are blocking too, because the example
 * then illustrates a prescription a pharmacist must not fill as written.
 */
export function labelEntry(doc: DocumentProfile | null, extraction: ExtractedPrescription | null): DatasetLabel {
  if (!extraction) {
    return {
      verdict: "bad",
      issues: [blocking("EXTRACTION_FAILED", "The extractor returned no usable result for this image.")],
      clinicalFindings: [],
      rulesVersion: RULES_VERSION,
      labelSource: "deterministic-rubric",
      humanReviewed: false,
    };
  }
  const result = runRules({ extraction, patient: null }, DATASET_RULES);
  const clinical = result.findings.filter((f) => !coveredByRubric(f.origin));
  const issues = [
    ...documentIssues(doc),
    ...headerIssues(extraction),
    ...medicationIssues(extraction),
    ...clinical.map((f) => blocking("CLINICAL_FLAG", `${f.origin}: ${f.title}`)),
  ];
  return {
    verdict: issues.some((i) => i.severity === "blocking") ? "bad" : "good",
    issues,
    clinicalFindings: clinical.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      origin: f.origin,
      medications: f.medications,
      referenceIds: f.referenceIds,
    })),
    rulesVersion: RULES_VERSION,
    labelSource: "deterministic-rubric",
    humanReviewed: false,
  };
}
