import type { AnalysisReport, ExtractedPrescription, Finding, FindingType } from "@/lib/shared";
import { isAiObservation } from "./safetySummary";

/**
 * Derives "what was not checked" and "where each finding came from" purely from the report.
 * Nothing here invents clinical data; it only reads coverage, extraction and findings.
 */

/** How a rule behaves when no patient record is linked (read from packages/clinical-rules/src/rules). */
export type NoPatientBehaviour = "NOT_RUN" | "PRESCRIPTION_ONLY" | "UNAFFECTED";

export interface RuleMeta {
  label: string;
  noPatient: NoPatientBehaviour;
}

/** Known rule ids and what they do without a patient record. Unknown ids fall back to a prefix guess. */
export const RULE_META: Readonly<Record<string, RuleMeta>> = {
  "interaction.pairwise": { label: "Drug interactions", noPatient: "PRESCRIPTION_ONLY" },
  "allergy.cross-reactivity": { label: "Allergy and cross-reactivity", noPatient: "NOT_RUN" },
  "context.no-patient": { label: "Patient record linked", noPatient: "UNAFFECTED" },
  "context.allergy-history": { label: "Allergy history verified", noPatient: "NOT_RUN" },
  "context.demographics": { label: "Age and demographics", noPatient: "NOT_RUN" },
  "therapy.duplicate": { label: "Duplicate therapy", noPatient: "PRESCRIPTION_ONLY" },
  "condition.contraindication": { label: "Condition contraindications", noPatient: "NOT_RUN" },
  "dose.daily-maximum": { label: "Daily dose limits", noPatient: "UNAFFECTED" },
  "rx.missing-fields": { label: "Required prescription fields", noPatient: "UNAFFECTED" },
  "rx.unresolved-drug": { label: "Drug name recognition", noPatient: "UNAFFECTED" },
  "rx.extraction-confidence": { label: "Extraction confidence", noPatient: "UNAFFECTED" },
  "entry.verify": { label: "Data entry verification", noPatient: "UNAFFECTED" },
};

const PATIENT_DEPENDENT_PREFIXES = ["context.", "allergy.", "condition."];

function ruleMeta(id: string): RuleMeta {
  const known = RULE_META[id];
  if (known) return known;
  const dependsOnPatient = PATIENT_DEPENDENT_PREFIXES.some((p) => id.startsWith(p));
  return { label: id, noPatient: dependsOnPatient ? "NOT_RUN" : "UNAFFECTED" };
}

export interface SkippedCheck {
  ruleId: string;
  label: string;
  /** Short neutral note; "against the prescription only" when the rule still ran partially. */
  note: string;
}

const NO_PATIENT_NOTE = {
  NOT_RUN: "not run",
  PRESCRIPTION_ONLY: "against the prescription only",
  UNAFFECTED: "",
} as const satisfies Record<NoPatientBehaviour, string>;

/** Checks from `rulesEvaluated` that could not fully run because no patient record was linked. */
export function patientDependentChecks(rulesEvaluated: readonly string[]): SkippedCheck[] {
  return rulesEvaluated.flatMap((ruleId) => {
    const meta = ruleMeta(ruleId);
    if (meta.noPatient === "UNAFFECTED") return [];
    return [{ ruleId, label: meta.label, note: NO_PATIENT_NOTE[meta.noPatient] }];
  });
}

export interface ChecksNotCompleted {
  patientContextUnavailable: boolean;
  patientDependent: SkippedCheck[];
  /** Medication lines excluded from drug-specific checks because the name was not recognized. */
  unrecognizedMedications: string[];
  /** Recognized lines whose daily-dose check was skipped for lack of strength or directions. */
  undosedMedications: string[];
  aiNotCompleted: boolean;
  noReferenceRetrieval: boolean;
  /** Engine-reported limitation strings, verbatim. */
  limitations: string[];
}

function undosed(m: ExtractedPrescription["medications"][number]): boolean {
  return m.normalizedName !== null && (!m.strength || (!m.frequency && !m.sig));
}

export function checksNotCompleted(report: AnalysisReport, patientLinked: boolean): ChecksNotCompleted {
  const { coverage, extraction, ai } = report;
  return {
    patientContextUnavailable: !patientLinked,
    patientDependent: patientLinked ? [] : patientDependentChecks(coverage.rulesEvaluated),
    unrecognizedMedications: extraction.medications.filter((m) => m.normalizedName === null).map((m) => m.rawName),
    undosedMedications: extraction.medications.filter(undosed).map((m) => m.rawName),
    aiNotCompleted: !coverage.llmUsed || ai === null,
    noReferenceRetrieval: coverage.retrievalMethod === "NONE",
    limitations: coverage.limitations,
  };
}

/** True when there is at least one check that did not fully run; the generic limitation strings alone do not count. */
export function hasChecksNotCompleted(c: ChecksNotCompleted): boolean {
  return c.patientContextUnavailable || c.unrecognizedMedications.length > 0 || c.undosedMedications.length > 0 || c.aiNotCompleted || c.noReferenceRetrieval;
}

export type FindingGroup = "ENTRY" | "PRESCRIPTION" | "PATIENT_RECORD" | "AI" | "SYSTEM";

/**
 * Where a finding type's evidence comes from. `BY_MEDICATIONS` means the type can arise from the
 * prescription alone or from the patient's current medications, so the finding's medication list
 * is compared with the extraction to decide. Adding a FindingType fails typecheck until mapped.
 */
export const FINDING_TYPE_GROUP = {
  DRUG_INTERACTION: "BY_MEDICATIONS",
  ALLERGY_CONFLICT: "PATIENT_RECORD",
  MISSING_PATIENT_INFO: "PATIENT_RECORD",
  MISSING_PRESCRIPTION_INFO: "PRESCRIPTION",
  DUPLICATE_THERAPY: "BY_MEDICATIONS",
  DOSE_CONCERN: "PRESCRIPTION",
  CONDITION_CONFLICT: "PATIENT_RECORD",
  EXTRACTION_UNCERTAINTY: "PRESCRIPTION",
  AI_OBSERVATION: "AI",
  SYSTEM_LIMITATION: "SYSTEM",
  DATA_ENTRY_MISMATCH: "ENTRY",
} as const satisfies Record<FindingType, FindingGroup | "BY_MEDICATIONS">;

export const FINDING_GROUP_ORDER: readonly FindingGroup[] = ["ENTRY", "PATIENT_RECORD", "PRESCRIPTION", "AI", "SYSTEM"];

export const FINDING_GROUP_META = {
  ENTRY: { title: "Data entry check", caption: "What was typed at intake compared with what was read on the script." },
  PRESCRIPTION: { title: "From the prescription alone", caption: "Checked using only what was read from the document." },
  PATIENT_RECORD: { title: "Using the patient record", caption: "Checked against recorded allergies, current medications, conditions or demographics." },
  AI: { title: "AI observations", caption: "Model-authored and not a rule hit; verify before acting." },
  SYSTEM: { title: "System limitations", caption: "Coverage notes about what this system can and cannot check." },
} as const satisfies Record<FindingGroup, { title: string; caption: string }>;

export function findingGroup(finding: Finding, extraction: ExtractedPrescription): FindingGroup {
  if (isAiObservation(finding)) return "AI";
  const group = FINDING_TYPE_GROUP[finding.type];
  if (group !== "BY_MEDICATIONS") return group;
  const prescribed = new Set(extraction.medications.flatMap((m) => [m.rawName.toLowerCase(), m.normalizedName?.toLowerCase() ?? ""]));
  const allPrescribed = finding.medications.every((name) => prescribed.has(name.toLowerCase()));
  return allPrescribed ? "PRESCRIPTION" : "PATIENT_RECORD";
}

export function groupFindings(findings: readonly Finding[], extraction: ExtractedPrescription): Array<{ group: FindingGroup; findings: Finding[] }> {
  const buckets: Record<FindingGroup, Finding[]> = { ENTRY: [], PRESCRIPTION: [], PATIENT_RECORD: [], AI: [], SYSTEM: [] };
  for (const f of findings) buckets[findingGroup(f, extraction)].push(f);
  return FINDING_GROUP_ORDER.filter((g) => buckets[g].length > 0).map((g) => ({ group: g, findings: buckets[g] }));
}
