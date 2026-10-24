import type { Disposition, Finding, ExtractedPrescription } from "@autoscript/shared";
import { SEVERITY_RANK } from "@autoscript/shared";

export interface DispositionInput {
  /** `proposedSeverity` is read for AI observations so that clamping an unsupported observation to LOW cannot relax the routing. */
  findings: Pick<Finding, "severity" | "deterministic" | "type" | "proposedSeverity">[];
  extraction: Pick<ExtractedPrescription, "overallConfidence" | "medications">;
  patientLinked: boolean;
  llmCompleted: boolean;
}

export interface DispositionResult {
  disposition: Disposition;
  reason: string;
}

/**
 * Policy: NO_FLAGS_DETECTED is only reached when every deterministic rule is
 * silent, the patient context was available, extraction was confident, and
 * the AI pass completed without raising a MODERATE-or-higher observation.
 * Anything else routes to a pharmacist. The system never "approves".
 */
function proposedOrShown(f: DispositionInput["findings"][number]) {
  return f.proposedSeverity ?? f.severity;
}

export function decideDisposition(input: DispositionInput): DispositionResult {
  const deterministic = input.findings.filter((f) => f.deterministic);
  if (deterministic.length > 0) {
    const top = deterministic.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));
    return {
      disposition: "MANUAL_REVIEW_NEEDED",
      reason: `${deterministic.length} deterministic finding(s); highest severity ${top.severity}.`,
    };
  }
  if (!input.patientLinked) {
    return { disposition: "MANUAL_REVIEW_NEEDED", reason: "No patient record linked; checks incomplete." };
  }
  if (input.extraction.medications.length === 0) {
    return { disposition: "MANUAL_REVIEW_NEEDED", reason: "No medications were extracted." };
  }
  if (input.extraction.overallConfidence < 0.7) {
    return { disposition: "MANUAL_REVIEW_NEEDED", reason: "Extraction confidence below threshold." };
  }
  if (!input.llmCompleted) {
    return { disposition: "MANUAL_REVIEW_NEEDED", reason: "AI contextual analysis did not complete; assessment is incomplete." };
  }
  const aiConcern = input.findings.find((f) => !f.deterministic && SEVERITY_RANK[proposedOrShown(f)] >= SEVERITY_RANK.MODERATE);
  if (aiConcern) {
    const proposed = proposedOrShown(aiConcern);
    const clamped = proposed !== aiConcern.severity ? ` (shown as ${aiConcern.severity}: no supporting reference was found)` : "";
    return { disposition: "MANUAL_REVIEW_NEEDED", reason: `AI observation rated ${proposed}${clamped} requires pharmacist confirmation.` };
  }
  return {
    disposition: "NO_FLAGS_DETECTED",
    reason: "No flags detected within checked criteria. This is not a statement of clinical safety; a pharmacist still completes the review.",
  };
}
