import { z } from "zod";

/**
 * Prescription fields as typed by the pharmacy technician at intake (AutoScript "manual entry").
 * The engine compares them with what it reads on the script and flags every mismatch, so
 * data-entry errors are caught before dispensing. All fields are optional: an empty field is
 * simply not compared.
 */
export const EnteredScriptDataSchema = z.object({
  patientFirstName: z.string().nullable().optional(),
  patientLastName: z.string().nullable().optional(),
  /** ISO yyyy-MM-dd */
  patientDateOfBirth: z.string().nullable().optional(),
  drugName: z.string().max(200).nullable().optional(),
  directions: z.string().max(500).nullable().optional(),
  quantity: z.number().int().min(1).max(9999).nullable().optional(),
  daySupply: z.number().int().min(1).max(365).nullable().optional(),
  refillCount: z.number().int().min(0).max(99).nullable().optional(),
  prescriberName: z.string().max(100).nullable().optional(),
  prescriberNpi: z.string().nullable().optional(),
  prescriberPhone: z.string().nullable().optional(),
});
export type EnteredScriptData = z.infer<typeof EnteredScriptDataSchema>;
