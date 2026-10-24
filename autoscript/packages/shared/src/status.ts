import { z } from "zod";

/**
 * Automated screening status of a prescription (what the RX Engine concluded).
 * `REVIEWED` is legacy: it was written when "reviewed" and the screening result shared one field.
 * It stays readable for existing rows and API compatibility but is no longer written; the
 * pharmacist's disposition lives in `ReviewStatus`.
 */
export const PrescriptionStatus = z.enum([
  "PROCESSING",
  "MANUAL_REVIEW_NEEDED",
  "NO_FLAGS_DETECTED",
  "REVIEWED",
  "FAILED",
]);
export type PrescriptionStatus = z.infer<typeof PrescriptionStatus>;

/**
 * Pharmacist disposition, independent of the screening status. None of these values means
 * "approved for dispensing": there is no dispensing approval in this system.
 */
export const ReviewStatus = z.enum([
  "PENDING_REVIEW",
  "REVIEWED",
  "INTERVENTION_REQUIRED",
  "INTERVENTION_DOCUMENTED",
  "INFO_REQUESTED",
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/** Stages the RX Engine reports while it works. Order matters for the progress UI. */
export const ProcessingStage = z.enum([
  "QUEUED",
  "EXTRACTING",
  "NORMALIZING",
  "LOADING_CONTEXT",
  "RUNNING_RULES",
  "RETRIEVING_EVIDENCE",
  "AI_ANALYSIS",
  "FINALIZING",
  "DONE",
  "FAILED",
]);
export type ProcessingStage = z.infer<typeof ProcessingStage>;

export const PROCESSING_STAGE_ORDER: ProcessingStage[] = [
  "QUEUED",
  "EXTRACTING",
  "NORMALIZING",
  "LOADING_CONTEXT",
  "RUNNING_RULES",
  "RETRIEVING_EVIDENCE",
  "AI_ANALYSIS",
  "FINALIZING",
  "DONE",
];

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  QUEUED: "Queued",
  EXTRACTING: "Extracting prescription",
  NORMALIZING: "Normalizing drug names",
  LOADING_CONTEXT: "Loading patient context",
  RUNNING_RULES: "Running clinical rules",
  RETRIEVING_EVIDENCE: "Retrieving reference evidence",
  AI_ANALYSIS: "AI contextual analysis",
  FINALIZING: "Building review report",
  DONE: "Complete",
  FAILED: "Failed",
};

export const SourceType = z.enum(["PDF", "IMAGE", "TEXT", "SIMULATED"]);
export type SourceType = z.infer<typeof SourceType>;
