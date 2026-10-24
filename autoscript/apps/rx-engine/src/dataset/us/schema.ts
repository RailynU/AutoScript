import { z } from "zod";
import { ExtractedPrescriptionSchema, PatientContextSchema } from "@autoscript/shared";
import { DatasetClinicalFindingSchema } from "../schema.js";

export const InjectedErrorCode = z.enum([
  "INTERACTION_ON_PRESCRIPTION",
  "INTERACTION_WITH_PROFILE",
  "ALLERGY_CONFLICT",
  "ALLERGY_CROSS_REACTIVITY",
  "DOSE_ABOVE_MAXIMUM",
  "DUPLICATE_THERAPY",
  "CONDITION_CONTRAINDICATION",
  "MISSING_STRENGTH",
  "MISSING_DIRECTIONS",
  "MISSING_QUANTITY",
  "MISSING_DATE",
  "MISSING_PRESCRIBER",
  "UNRECOGNIZED_DRUG",
]);
export type InjectedErrorCode = z.infer<typeof InjectedErrorCode>;

export const ScenarioKind = z.enum(["CLEAN", "INTERACTION", "ALLERGY", "DOSE", "DUPLICATE", "CONDITION", "MISSING_FIELD", "UNRECOGNIZED_DRUG"]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const GroundTruthMedicationSchema = z.object({
  /** Exactly as written on the image (brand or generic). */
  writtenName: z.string(),
  generic: z.string().nullable(),
  strength: z.string().nullable(),
  form: z.string(),
  route: z.string(),
  sig: z.string().nullable(),
  quantity: z.string().nullable(),
  refills: z.string(),
  indication: z.string().nullable(),
});
export type GroundTruthMedication = z.infer<typeof GroundTruthMedicationSchema>;

export const GroundTruthSchema = z.object({
  patient: PatientContextSchema,
  patientAddress: z.string(),
  prescriber: z.object({ name: z.string().nullable(), clinic: z.string(), street: z.string(), cityState: z.string(), phone: z.string(), npi: z.string(), dea: z.string().nullable() }),
  dateWritten: z.string().nullable(),
  /** The date as printed on the image (MM/DD/YYYY), or null when omitted. */
  dateAsWritten: z.string().nullable(),
  allergiesOnScript: z.string().nullable(),
  medications: z.array(GroundTruthMedicationSchema),
  notes: z.string().nullable(),
});
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export const ExtractionScoreSchema = z.object({
  patientName: z.boolean(),
  prescriberName: z.boolean(),
  dateWritten: z.boolean(),
  medicationsExpected: z.number().int(),
  medicationsFound: z.number().int(),
  medicationsMatched: z.number().int(),
  strengthMatched: z.number().int(),
  frequencyMatched: z.number().int(),
  quantityMatched: z.number().int(),
  /** Share of all compared fields that matched, 0-1. */
  overall: z.number().min(0).max(1),
});
export type ExtractionScore = z.infer<typeof ExtractionScoreSchema>;

export const UsDatasetEntrySchema = z.object({
  id: z.string(),
  scenario: ScenarioKind,
  style: z.enum(["printed", "handwritten"]),
  difficulty: z.enum(["clean", "noisy"]),
  image: z.object({ path: z.string(), sha256: z.string(), bytes: z.number().int(), width: z.number().int(), height: z.number().int(), mimeType: z.literal("image/png") }),
  groundTruth: GroundTruthSchema,
  injectedErrors: z.array(z.object({ code: InjectedErrorCode, detail: z.string() })),
  label: z.object({
    verdict: z.enum(["good", "bad"]),
    /** Deterministic rule hits when the ground truth is checked against the patient record. */
    ruleFindings: z.array(DatasetClinicalFindingSchema),
    /** "consistent": rules agree with the injected errors; otherwise which side disagrees. */
    consistency: z.enum(["consistent", "rules-missed", "rules-extra"]),
    rulesVersion: z.string(),
    labelSource: z.literal("ground-truth+deterministic-rules"),
  }),
  /** Vision-model transcription of the rendered image, when the build ran with --extract. */
  extraction: ExtractedPrescriptionSchema.nullable(),
  extractionScore: ExtractionScoreSchema.nullable(),
  provenance: z.object({ seed: z.number().int(), generatorVersion: z.string(), model: z.string().nullable(), extractedAt: z.string().nullable(), error: z.string().nullable() }),
});
export type UsDatasetEntry = z.infer<typeof UsDatasetEntrySchema>;

export const UsDatasetFileSchema = z.object({
  name: z.string(),
  version: z.string(),
  generatedAt: z.string(),
  seed: z.number().int(),
  schemaNote: z.string(),
  stats: z.object({
    total: z.number().int(),
    good: z.number().int(),
    bad: z.number().int(),
    byScenario: z.record(z.number().int()),
    byInjectedError: z.record(z.number().int()),
    consistency: z.record(z.number().int()),
    extraction: z
      .object({ scored: z.number().int(), meanOverall: z.number(), medicationsMatched: z.number().int(), medicationsExpected: z.number().int(), patientNameMatched: z.number().int(), dateMatched: z.number().int() })
      .nullable(),
  }),
  entries: z.array(UsDatasetEntrySchema),
});
export type UsDatasetFile = z.infer<typeof UsDatasetFileSchema>;
