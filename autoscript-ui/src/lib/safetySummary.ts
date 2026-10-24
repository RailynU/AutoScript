import { SEVERITY_RANK, type Finding, type PrescriptionDetail, type Severity } from "@/lib/shared";

/**
 * Derives the Clinical Safety Summary strip purely from a prescription and its report.
 * Nothing here is hardcoded clinical text: labels are read from findings and extraction.
 */

/** An AI observation is anything the engine did not produce from a deterministic rule. */
export function isAiObservation(finding: Pick<Finding, "deterministic" | "origin">): boolean {
  return !finding.deterministic || finding.origin === "llm";
}

export function highestSeverity(findings: readonly Finding[]): Severity | null {
  let best: Severity | null = null;
  for (const f of findings) {
    if (best === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[best]) best = f.severity;
  }
  return best;
}

/** Short form of a finding title: the part before the first colon, e.g. "No patient record linked". */
export function shortTitle(title: string): string {
  const head = title.split(":")[0]?.trim();
  return head && head.length > 0 ? head : title;
}

export interface SafetySummary {
  patientLinked: boolean;
  /** "First Last" when linked, otherwise "No patient linked". */
  patientLabel: string;
  /** Patient name as read from the document; explains an unlinked record. */
  documentPatientName: string | null;
  /** Medication names as written on the prescription (extraction first, list summary as fallback). */
  medications: string[];
  /** Highest severity among deterministic (rule-based) findings. AI observations are excluded. */
  highestSupportedSeverity: Severity | null;
  /** Highest severity among AI observations, reported separately. */
  highestAiSeverity: Severity | null;
  ruleFindingCount: number;
  aiObservationCount: number;
  /** Short titles of MISSING_PATIENT_INFO findings; "No patient record linked" when unlinked and no rule said so. */
  missingPatientInfo: string[];
  /** True while the engine is still working, so counts are not final. */
  pending: boolean;
}

const NO_PATIENT_LABEL = "No patient linked";
const NO_PATIENT_RECORD = "No patient record linked";

function medicationNames(rx: PrescriptionDetail): string[] {
  const fromReport = rx.report?.extraction.medications.map((m) => m.rawName.trim()).filter((n) => n.length > 0) ?? [];
  return fromReport.length > 0 ? dedupe(fromReport) : dedupe(rx.medicationSummary);
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingPatientInfo(findings: readonly Finding[], patientLinked: boolean): string[] {
  const fromRules = dedupe(findings.filter((f) => f.type === "MISSING_PATIENT_INFO").map((f) => shortTitle(f.title)));
  if (patientLinked || fromRules.some((t) => t.toLowerCase() === NO_PATIENT_RECORD.toLowerCase())) return fromRules;
  return [NO_PATIENT_RECORD, ...fromRules];
}

export function buildSafetySummary(rx: PrescriptionDetail): SafetySummary {
  const findings = rx.report?.findings ?? [];
  const rule = findings.filter((f) => !isAiObservation(f));
  const ai = findings.filter(isAiObservation);
  const patientLinked = rx.patientContext !== null || rx.patient !== null;
  return {
    patientLinked,
    patientLabel: rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : NO_PATIENT_LABEL,
    documentPatientName: rx.report?.extraction.patientName ?? null,
    medications: medicationNames(rx),
    highestSupportedSeverity: highestSeverity(rule),
    highestAiSeverity: highestSeverity(ai),
    ruleFindingCount: rule.length,
    aiObservationCount: ai.length,
    missingPatientInfo: missingPatientInfo(findings, patientLinked),
    pending: rx.status === "PROCESSING",
  };
}
