import { z } from "zod";

/** One medication line extracted from a prescription document. */
export const ExtractedMedicationSchema = z.object({
  rawName: z.string().min(1),
  /** Normalized lower-case generic name, when the normalizer recognized it. */
  normalizedName: z.string().nullable().default(null),
  /** How the normalized name was produced. */
  normalizationSource: z.enum(["LOCAL_MAP", "LLM", "UNRESOLVED"]).default("UNRESOLVED"),
  strength: z.string().nullable().default(null),
  form: z.string().nullable().default(null),
  route: z.string().nullable().default(null),
  sig: z.string().nullable().default(null),
  frequency: z.string().nullable().default(null),
  quantity: z.string().nullable().default(null),
  refills: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  indication: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ExtractedMedication = z.infer<typeof ExtractedMedicationSchema>;

export const ExtractedPrescriptionSchema = z.object({
  patientName: z.string().nullable().default(null),
  patientDateOfBirth: z.string().nullable().default(null),
  prescriberName: z.string().nullable().default(null),
  prescriberIdentifier: z.string().nullable().default(null),
  dateWritten: z.string().nullable().default(null),
  medications: z.array(ExtractedMedicationSchema),
  /** Allergies written on the document itself (not from the patient record). */
  statedAllergies: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  /** Parts of the document the extractor could not read or was unsure about. */
  uncertainties: z.array(z.string()).default([]),
  overallConfidence: z.number().min(0).max(1).default(0.5),
  /** Which extractor produced this (model id or "deterministic-text-parser"). */
  extractor: z.string(),
});
export type ExtractedPrescription = z.infer<typeof ExtractedPrescriptionSchema>;
