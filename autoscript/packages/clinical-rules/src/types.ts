import type {
  EnteredScriptData,
  ExtractedMedication,
  ExtractedPrescription,
  Finding,
  PatientContext,
} from "@autoscript/shared";

/** A finding before evidence chunks are attached by the engine. */
export interface RuleFinding extends Omit<Finding, "evidence" | "aiContext"> {
  /** Ids of curated reference documents that back this rule. */
  referenceIds: string[];
  /**
   * Sections of those documents that do not apply to this finding (for example a criterion about
   * long-term use on a short-course finding), as "documentId::section heading". The engine does not
   * attach them as rule evidence.
   */
  excludedSections?: string[];
  /** Free-text retrieval query the engine can use to pull additional evidence. */
  retrievalQuery: string;
}

export interface RuleInput {
  extraction: ExtractedPrescription;
  patient: PatientContext | null;
  /** Technician manual entry to verify against the script (AutoScript intake). */
  entered?: EnteredScriptData | null;
}

export interface RuleResult {
  findings: RuleFinding[];
  /** Rule ids that ran (used for the coverage statement). */
  rulesEvaluated: string[];
  /** Human-readable limitations that applied to this specific run. */
  limitations: string[];
}

export type Rule = {
  id: string;
  description: string;
  run: (input: RuleInput) => RuleFinding[];
};

export type MedicationLike = Pick<ExtractedMedication, "rawName" | "normalizedName">;
