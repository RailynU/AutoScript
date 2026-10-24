import { z } from "zod";
import { EnteredScriptDataSchema } from "./entry";
import { ExtractedPrescriptionSchema } from "./extraction";
import { FindingSchema, Disposition, EvidenceRefSchema } from "./findings";
import { PatientContextSchema } from "./patient";
import { ProcessingStage } from "./status";

/** Payload the API sends to the RX Engine. */
export const AnalyzeRequestSchema = z.object({
  prescriptionId: z.string(),
  callbackUrl: z.string().url(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string().min(1) }),
    z.object({
      kind: z.literal("file"),
      fileName: z.string(),
      mimeType: z.string(),
      base64: z.string().min(1),
    }),
  ]),
  patient: PatientContextSchema.nullable(),
  /** Technician-entered fields to verify against the script; null when entry was skipped. */
  enteredData: EnteredScriptDataSchema.nullable().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const ProgressEventSchema = z.object({
  stage: ProcessingStage,
  message: z.string(),
  percent: z.number().min(0).max(100),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/** A labelled dataset case retrieved as an illustrative example (never citable evidence). */
export const SimilarCaseSchema = z.object({
  id: z.string(),
  dataset: z.enum(["us-synthetic", "prescriptions"]),
  scenario: z.string().nullable().default(null),
  verdict: z.enum(["good", "bad"]),
  /** Injected error codes or rubric issue codes that explain the verdict. */
  reasons: z.array(z.string()).default([]),
  score: z.number().nullable().default(null),
  retrieval: z.enum(["VECTOR", "LEXICAL"]),
});
export type SimilarCase = z.infer<typeof SimilarCaseSchema>;

export const AiAnalysisSchema = z.object({
  model: z.string(),
  summary: z.string(),
  /** The model's narrative reasoning, grounded in evidence ids. */
  reasoning: z.string(),
  reviewQuestions: z.array(z.string()),
  /** Citations the model used that were NOT in the provided evidence (dropped). */
  rejectedCitations: z.array(z.string()).default([]),
  /** Labelled example cases shown to the model for calibration (not evidence; never cited). */
  similarCases: z.array(SimilarCaseSchema).default([]),
  promptTokens: z.number().nullable().default(null),
  completionTokens: z.number().nullable().default(null),
  durationMs: z.number(),
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

export const ChecksCoverageSchema = z.object({
  rulesEvaluated: z.array(z.string()),
  referenceDocumentsSearched: z.number(),
  retrievalMethod: z.enum(["VECTOR", "LEXICAL", "NONE"]),
  llmUsed: z.boolean(),
  limitations: z.array(z.string()),
});
export type ChecksCoverage = z.infer<typeof ChecksCoverageSchema>;

/** Final structured report the engine posts back to the API. */
export const AnalysisReportSchema = z.object({
  prescriptionId: z.string(),
  disposition: Disposition,
  dispositionReason: z.string(),
  extraction: ExtractedPrescriptionSchema,
  findings: z.array(FindingSchema),
  evidence: z.array(EvidenceRefSchema),
  ai: AiAnalysisSchema.nullable(),
  coverage: ChecksCoverageSchema,
  engineVersion: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
});
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

export const EngineCallbackSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), progress: ProgressEventSchema }),
  z.object({ type: z.literal("result"), report: AnalysisReportSchema }),
  z.object({
    type: z.literal("failed"),
    error: z.string(),
    stage: ProcessingStage,
  }),
]);
export type EngineCallback = z.infer<typeof EngineCallbackSchema>;
