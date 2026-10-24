import { z } from "zod";
import { PrescriptionStatus, ProcessingStage, ReviewStatus, SourceType } from "./status";
import { PatientSummarySchema, PatientContextSchema } from "./patient";
import { AnalysisReportSchema } from "./engine";
import { EnteredScriptDataSchema } from "./entry";

/**
 * Kinds of pharmacist review actions. On the wire the field is still called `action`
 * (existing clients post `{ action: "MARK_REVIEWED" }`); `MARK_REVIEWED` is the legacy kind.
 */
export const ReviewKindSchema = z.enum([
  "NOTE",
  "MARK_REVIEWED",
  "PRESCRIBER_CONTACTED",
  "INFO_REQUESTED",
  "INTERVENTION_DOCUMENTED",
  "REVIEWED_NO_INTERVENTION",
  "INTERVENTION_REQUIRED",
  "OTHER",
]);
export type ReviewKind = z.infer<typeof ReviewKindSchema>;
/** @deprecated alias kept for existing imports; use ReviewKindSchema. */
export const ReviewActionSchema = ReviewKindSchema;
export type ReviewAction = ReviewKind;

/**
 * Review status each action kind moves the prescription to; `null` leaves it unchanged.
 * `satisfies Record<ReviewKind, …>` makes a new kind without a transition a type error.
 */
export const REVIEW_KIND_TRANSITIONS = {
  NOTE: null,
  MARK_REVIEWED: "REVIEWED",
  PRESCRIBER_CONTACTED: "INFO_REQUESTED",
  INFO_REQUESTED: "INFO_REQUESTED",
  INTERVENTION_DOCUMENTED: "INTERVENTION_DOCUMENTED",
  REVIEWED_NO_INTERVENTION: "REVIEWED",
  INTERVENTION_REQUIRED: "INTERVENTION_REQUIRED",
  OTHER: null,
} as const satisfies Record<ReviewKind, ReviewStatus | null>;

/** Kinds that cannot be recorded without a note. */
export const REVIEW_KINDS_REQUIRING_NOTE = {
  NOTE: true,
  MARK_REVIEWED: false,
  PRESCRIBER_CONTACTED: false,
  INFO_REQUESTED: false,
  INTERVENTION_DOCUMENTED: false,
  REVIEWED_NO_INTERVENTION: false,
  INTERVENTION_REQUIRED: false,
  OTHER: true,
} as const satisfies Record<ReviewKind, boolean>;

/** Review statuses that mark the pharmacist's review as completed (set `reviewedAt`). */
export const REVIEW_COMPLETING_STATUSES = {
  PENDING_REVIEW: false,
  REVIEWED: true,
  INTERVENTION_REQUIRED: false,
  INTERVENTION_DOCUMENTED: true,
  INFO_REQUESTED: false,
} as const satisfies Record<ReviewStatus, boolean>;

export function reviewKindRequiresNote(kind: ReviewKind): boolean {
  return REVIEW_KINDS_REQUIRING_NOTE[kind];
}

export const ReviewSchema = z.object({
  id: z.string(),
  prescriptionId: z.string(),
  action: ReviewKindSchema,
  pharmacistName: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const PrescriptionListItemSchema = z.object({
  id: z.string(),
  externalRef: z.string(),
  status: PrescriptionStatus,
  reviewStatus: ReviewStatus,
  sourceType: SourceType,
  fileName: z.string().nullable(),
  patient: PatientSummarySchema.nullable(),
  medicationSummary: z.array(z.string()),
  findingCount: z.number(),
  highestSeverity: z.string().nullable(),
  progressStage: ProcessingStage,
  progressMessage: z.string().nullable(),
  progressPercent: z.number(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export type PrescriptionListItem = z.infer<typeof PrescriptionListItemSchema>;

export const PrescriptionDetailSchema = PrescriptionListItemSchema.extend({
  rawText: z.string().nullable(),
  mimeType: z.string().nullable(),
  patientContext: PatientContextSchema.nullable(),
  report: AnalysisReportSchema.nullable(),
  /** What the technician typed at intake (verified against the script by the engine). */
  enteredData: EnteredScriptDataSchema.nullable(),
  /** Full review history, newest first. */
  reviews: z.array(ReviewSchema),
});
export type PrescriptionDetail = z.infer<typeof PrescriptionDetailSchema>;

export const DashboardStatsSchema = z.object({
  // Screening status counts (Prescription.status).
  processing: z.number(),
  manualReviewNeeded: z.number(),
  noFlagsDetected: z.number(),
  failed: z.number(),
  /** Prescriptions whose review was completed since local midnight (reviewedAt), regardless of later actions. */
  reviewedToday: z.number(),
  total: z.number(),
  // Pharmacist disposition counts (Prescription.reviewStatus).
  pendingReview: z.number(),
  interventionRequired: z.number(),
  infoRequested: z.number(),
  interventionDocumented: z.number(),
  reviewed: z.number(),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

export const CreateTextPrescriptionSchema = z.object({
  text: z.string().min(5, "Prescription text is too short"),
  patientId: z.string().nullable().optional(),
});
export type CreateTextPrescription = z.infer<typeof CreateTextPrescriptionSchema>;

export function reviewNoteRequiredMessage(kind: ReviewKind): string {
  return kind === "NOTE" ? "A note is required to add a note." : `A note is required for the "${kind}" action.`;
}

export const CreateReviewSchema = z
  .object({
    action: ReviewKindSchema,
    pharmacistName: z.string().min(1).default("Demo Pharmacist"),
    notes: z.string().max(5000).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (reviewKindRequiresNote(body.action) && !body.notes?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: reviewNoteRequiredMessage(body.action) });
    }
  });
export type CreateReview = z.infer<typeof CreateReviewSchema>;

/** Server-sent event emitted by the API whenever a prescription changes. */
export const PrescriptionEventSchema = z.object({
  type: z.enum(["created", "progress", "completed", "failed", "reviewed"]),
  prescription: PrescriptionListItemSchema,
});
export type PrescriptionEvent = z.infer<typeof PrescriptionEventSchema>;
