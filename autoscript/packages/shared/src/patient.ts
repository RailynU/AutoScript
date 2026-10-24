import { z } from "zod";

export const AllergySchema = z.object({
  id: z.string().optional(),
  substance: z.string(),
  reaction: z.string().nullable().optional(),
  severity: z.enum(["MILD", "MODERATE", "SEVERE", "UNKNOWN"]).default("UNKNOWN"),
  recordedAt: z.string().nullable().optional(),
});
export type Allergy = z.infer<typeof AllergySchema>;

export const ConditionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  icd10: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "RESOLVED"]).default("ACTIVE"),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const PatientMedicationSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  genericName: z.string().nullable().optional(),
  dose: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
export type PatientMedication = z.infer<typeof PatientMedicationSchema>;

export const PatientContextSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string().nullable(),
  sex: z.enum(["F", "M", "X", "UNKNOWN"]).nullable(),
  phone: z.string().nullable(),
  weightKg: z.number().nullable(),
  renalFunctionNote: z.string().nullable().optional(),
  allergiesVerified: z.boolean(),
  allergies: z.array(AllergySchema),
  conditions: z.array(ConditionSchema),
  medications: z.array(PatientMedicationSchema),
});
export type PatientContext = z.infer<typeof PatientContextSchema>;

export const PatientSummarySchema = PatientContextSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
});
export type PatientSummary = z.infer<typeof PatientSummarySchema>;

/** Body for creating a patient profile from the AutoScript intake / patient lookup screens. */
export const CreatePatientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  /** ISO yyyy-MM-dd */
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  sex: z.enum(["F", "M", "X", "UNKNOWN"]).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  allergiesVerified: z.boolean().default(false),
  allergies: z.array(AllergySchema.omit({ id: true, recordedAt: true })).default([]),
  conditions: z.array(ConditionSchema.omit({ id: true })).default([]),
  medications: z.array(PatientMedicationSchema.omit({ id: true, startedAt: true })).default([]),
});
export type CreatePatient = z.infer<typeof CreatePatientSchema>;
