import { z } from "zod";
import { ExtractedPrescriptionSchema } from "@autoscript/shared";

/** What the vision model says about the document itself (not its content). */
export const DocumentProfileSchema = z.object({
  type: z.enum(["prescription", "medical_certificate", "lab_request", "referral", "other", "not_a_document"]),
  handwritten: z.enum(["handwritten", "printed", "mixed"]),
  language: z.string().nullable().default(null),
  /** 0-1: how readable the writing is, independent of what it says. */
  legibility: z.number().min(0).max(1),
  qualityNotes: z.array(z.string()).default([]),
});
export type DocumentProfile = z.infer<typeof DocumentProfileSchema>;

export const DatasetIssueCode = z.enum([
  "NOT_A_PRESCRIPTION",
  "NO_MEDICATIONS",
  "LOW_LEGIBILITY",
  "LOW_EXTRACTION_CONFIDENCE",
  "MISSING_PATIENT",
  "MISSING_PRESCRIBER",
  "MISSING_DATE",
  "MEDICATION_MISSING_STRENGTH",
  "MEDICATION_MISSING_DIRECTIONS",
  "MEDICATION_MISSING_QUANTITY",
  "UNRECOGNIZED_DRUG",
  "CLINICAL_FLAG",
  "EXTRACTION_FAILED",
]);
export type DatasetIssueCode = z.infer<typeof DatasetIssueCode>;

export const DatasetIssueSchema = z.object({
  code: DatasetIssueCode,
  /** "blocking" makes the example "bad"; "warning" is kept on a "good" example. */
  severity: z.enum(["blocking", "warning"]),
  detail: z.string(),
});
export type DatasetIssue = z.infer<typeof DatasetIssueSchema>;

export const DatasetClinicalFindingSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  explanation: z.string(),
  origin: z.string(),
  medications: z.array(z.string()),
  referenceIds: z.array(z.string()),
});

export const DatasetLabelSchema = z.object({
  verdict: z.enum(["good", "bad"]),
  issues: z.array(DatasetIssueSchema),
  /** Deterministic clinical rule hits on the medication list alone (no patient record). */
  clinicalFindings: z.array(DatasetClinicalFindingSchema),
  rulesVersion: z.string(),
  labelSource: z.literal("deterministic-rubric"),
  /** Always false until a pharmacist edits the entry by hand. */
  humanReviewed: z.boolean(),
});
export type DatasetLabel = z.infer<typeof DatasetLabelSchema>;

export const DatasetEntrySchema = z.object({
  id: z.string(),
  image: z.object({
    path: z.string(),
    originalFileName: z.string(),
    sha256: z.string(),
    bytes: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    mimeType: z.literal("image/jpeg"),
  }),
  /** Id of the first entry with the same image bytes, or null. */
  duplicateOf: z.string().nullable(),
  document: DocumentProfileSchema.nullable(),
  /** Same shape the app produces for an uploaded image; null when extraction failed. */
  extraction: ExtractedPrescriptionSchema.nullable(),
  label: DatasetLabelSchema,
  /** Contact details (phones, emails, URLs, license numbers) replaced with "[redacted]". */
  piiRedacted: z.boolean(),
  provenance: z.object({
    model: z.string().nullable(),
    extractedAt: z.string(),
    durationMs: z.number().nullable(),
    error: z.string().nullable(),
  }),
});
export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;

export const DatasetFileSchema = z.object({
  name: z.string(),
  version: z.string(),
  generatedAt: z.string(),
  source: z.string(),
  schemaNote: z.string(),
  stats: z.object({
    total: z.number().int(),
    good: z.number().int(),
    bad: z.number().int(),
    duplicates: z.number().int(),
    extractionFailed: z.number().int(),
    byDocumentType: z.record(z.number().int()),
    byIssue: z.record(z.number().int()),
  }),
  entries: z.array(DatasetEntrySchema),
});
export type DatasetFile = z.infer<typeof DatasetFileSchema>;
