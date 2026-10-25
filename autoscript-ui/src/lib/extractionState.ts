import type { ExtractedMedication, ExtractedPrescription, PrescriptionStatus } from "@/lib/shared";

/**
 * Extraction confidence values are the extractor's self-report and are not calibrated, so the
 * UI never shows them as percentages. This module folds them, together with the structured
 * gaps in the extraction, into a small set of states and per-line highlights.
 */

/** Below this, the extractor's own report is treated as unreliable ("uncertain"). */
export const UNCERTAIN_BELOW = 0.7;
/** Below this (and at or above UNCERTAIN_BELOW), verification against the original is recommended. */
export const VERIFY_BELOW = 0.9;

/** Uncertainty notes that mean part of the document physically could not be read. */
const UNREADABLE_PATTERN = /\b(unreadable|illegible|not legible|cannot be read|could not be read|cut[ -]?off|truncated|obscured|smudged)\b/i;

export type ExtractionState = "FAILED" | "UNCERTAIN" | "VERIFY" | "COMPLETED";

export type ExtractionReason =
  | "NO_EXTRACTION"
  | "STATUS_FAILED"
  | "LOW_OVERALL_CONFIDENCE"
  | "LOW_LINE_CONFIDENCE"
  | "UNRECOGNIZED_MEDICATION"
  | "UNREADABLE_PARTS"
  | "MODERATE_CONFIDENCE"
  | "EXTRACTOR_NOTES"
  | "INCOMPLETE_LINE";

export interface ExtractionAssessment {
  state: ExtractionState;
  /** Every reason that applied, strongest state first; the UI shows the first few. */
  reasons: ExtractionReason[];
}

export type MedicationFlag = "UNRECOGNIZED" | "UNCERTAIN_DOSAGE" | "AMBIGUOUS_FREQUENCY" | "MISSING_ROUTE" | "MISSING_QUANTITY";

export type HighlightTone = "amber" | "red";

export interface ExtractionStateMeta {
  label: string;
  tone: "red" | "amber" | "neutral";
  /** One line shown under the label; the COMPLETED line is the mandatory reminder. */
  hint: string;
}

export const EXTRACTION_STATE_META = {
  FAILED: { label: "Extraction failed", tone: "red", hint: "Nothing from this pane can be relied on. Work from the original document." },
  UNCERTAIN: { label: "Extraction uncertain", tone: "red", hint: "Parts of this transcription may be wrong. Confirm every line against the original before using any check." },
  VERIFY: { label: "Verification recommended", tone: "amber", hint: "Compare each line with the original; some details were missing or read with limited confidence." },
  COMPLETED: { label: "Extraction completed", tone: "neutral", hint: "Still compare with the original. A completed transcription does not imply the prescription is clinically correct." },
} as const satisfies Record<ExtractionState, ExtractionStateMeta>;

export const EXTRACTION_REASON_LABEL = {
  NO_EXTRACTION: "no transcription was produced",
  STATUS_FAILED: "processing failed",
  LOW_OVERALL_CONFIDENCE: "extractor reported low confidence overall",
  LOW_LINE_CONFIDENCE: "extractor reported low confidence on a medication line",
  UNRECOGNIZED_MEDICATION: "a medication name was not recognized",
  UNREADABLE_PARTS: "extractor noted unreadable or cut-off parts",
  MODERATE_CONFIDENCE: "extractor reported limited confidence",
  EXTRACTOR_NOTES: "extractor left notes about the document",
  INCOMPLETE_LINE: "a medication line is missing strength, directions, route or quantity",
} as const satisfies Record<ExtractionReason, string>;

export const MEDICATION_FLAG_META = {
  UNRECOGNIZED: { label: "Unrecognized medication", tone: "red" },
  UNCERTAIN_DOSAGE: { label: "Uncertain dosage", tone: "amber" },
  AMBIGUOUS_FREQUENCY: { label: "Ambiguous frequency", tone: "amber" },
  MISSING_ROUTE: { label: "Missing route", tone: "amber" },
  MISSING_QUANTITY: { label: "Missing quantity", tone: "amber" },
} as const satisfies Record<MedicationFlag, { label: string; tone: HighlightTone }>;

const FLAG_ORDER: readonly MedicationFlag[] = ["UNRECOGNIZED", "UNCERTAIN_DOSAGE", "AMBIGUOUS_FREQUENCY", "MISSING_ROUTE", "MISSING_QUANTITY"];

/** Inline highlights for one medication line, in display order. */
export function medicationFlags(m: ExtractedMedication): MedicationFlag[] {
  const applies: Record<MedicationFlag, boolean> = {
    UNRECOGNIZED: m.normalizationSource === "UNRESOLVED" || m.normalizedName === null,
    UNCERTAIN_DOSAGE: !m.strength || m.confidence < UNCERTAIN_BELOW,
    AMBIGUOUS_FREQUENCY: !m.sig && !m.frequency,
    MISSING_ROUTE: !m.route,
    MISSING_QUANTITY: !m.quantity,
  };
  return FLAG_ORDER.filter((flag) => applies[flag]);
}

/** True when the line lacks any of strength, directions (sig or frequency), route or quantity. */
export function medicationIncomplete(m: ExtractedMedication): boolean {
  return !m.strength || (!m.sig && !m.frequency) || !m.route || !m.quantity;
}

export function mentionsUnreadable(uncertainties: readonly string[]): boolean {
  return uncertainties.some((u) => UNREADABLE_PATTERN.test(u));
}

export interface ExtractionStateInput {
  status: PrescriptionStatus;
  extraction: ExtractedPrescription | null;
}

/**
 * Pure. Precedence: FAILED > UNCERTAIN > VERIFY > COMPLETED.
 *  - FAILED: status FAILED, or no extraction.
 *  - UNCERTAIN: overall < 0.7, any line < 0.7, any UNRESOLVED line, or an uncertainty note about unreadable/illegible/cut-off text.
 *  - VERIFY: 0.7 <= overall < 0.9, any uncertainty note, or any line missing strength, sig/frequency, route or quantity.
 *  - COMPLETED: otherwise.
 */
export function assessExtraction({ status, extraction }: ExtractionStateInput): ExtractionAssessment {
  if (status === "FAILED") return { state: "FAILED", reasons: ["STATUS_FAILED"] };
  if (!extraction) return { state: "FAILED", reasons: ["NO_EXTRACTION"] };

  const meds = extraction.medications;
  const uncertain: ExtractionReason[] = [];
  if (extraction.overallConfidence < UNCERTAIN_BELOW) uncertain.push("LOW_OVERALL_CONFIDENCE");
  if (meds.some((m) => m.confidence < UNCERTAIN_BELOW)) uncertain.push("LOW_LINE_CONFIDENCE");
  if (meds.some((m) => m.normalizationSource === "UNRESOLVED" || m.normalizedName === null)) uncertain.push("UNRECOGNIZED_MEDICATION");
  if (mentionsUnreadable(extraction.uncertainties)) uncertain.push("UNREADABLE_PARTS");

  const verify: ExtractionReason[] = [];
  if (extraction.overallConfidence >= UNCERTAIN_BELOW && extraction.overallConfidence < VERIFY_BELOW) verify.push("MODERATE_CONFIDENCE");
  if (extraction.uncertainties.length > 0 && !uncertain.includes("UNREADABLE_PARTS")) verify.push("EXTRACTOR_NOTES");
  if (meds.some(medicationIncomplete)) verify.push("INCOMPLETE_LINE");

  if (uncertain.length > 0) return { state: "UNCERTAIN", reasons: [...uncertain, ...verify] };
  if (verify.length > 0) return { state: "VERIFY", reasons: verify };
  return { state: "COMPLETED", reasons: [] };
}

export function extractionState(input: ExtractionStateInput): ExtractionState {
  return assessExtraction(input).state;
}
