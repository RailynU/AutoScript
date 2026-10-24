import type { Patient, Allergy, Condition, PatientMedication, Prescription, Review } from "@prisma/client";
import {
  AnalysisReportSchema,
  EnteredScriptDataSchema,
  type AnalysisReport,
  type PatientContext,
  type PatientSummary,
  type PrescriptionDetail,
  type PrescriptionListItem,
  type ProcessingStage,
  type Review as ReviewDto,
} from "@autoscript/shared";

export type PatientWithRelations = Patient & {
  allergies: Allergy[];
  conditions: Condition[];
  medications: PatientMedication[];
};

const toDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toPatientSummary(p: Patient): PatientSummary {
  return { id: p.id, firstName: p.firstName, lastName: p.lastName, dateOfBirth: toDate(p.dateOfBirth), phone: p.phone };
}

export function toPatientContext(p: PatientWithRelations): PatientContext {
  const sex = p.sex === "F" || p.sex === "M" || p.sex === "X" ? p.sex : p.sex ? "UNKNOWN" : null;
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: toDate(p.dateOfBirth),
    sex,
    phone: p.phone,
    weightKg: p.weightKg,
    renalFunctionNote: p.renalFunctionNote,
    allergiesVerified: p.allergiesVerified,
    allergies: p.allergies.map((a) => ({
      id: a.id,
      substance: a.substance,
      reaction: a.reaction,
      severity: (["MILD", "MODERATE", "SEVERE", "UNKNOWN"] as const).includes(a.severity as never) ? (a.severity as "MILD") : "UNKNOWN",
      recordedAt: toDate(a.recordedAt),
    })),
    conditions: p.conditions.map((c) => ({ id: c.id, name: c.name, icd10: c.icd10, status: c.status === "RESOLVED" ? "RESOLVED" : "ACTIVE" })),
    medications: p.medications.map((m) => ({
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      dose: m.dose,
      frequency: m.frequency,
      startedAt: toDate(m.startedAt),
      active: m.active,
    })),
  };
}

export type PrescriptionWithPatient = Prescription & { patient: Patient | null };

export function toListItem(rx: PrescriptionWithPatient): PrescriptionListItem {
  return {
    id: rx.id,
    externalRef: rx.externalRef,
    status: rx.status,
    reviewStatus: rx.reviewStatus,
    sourceType: rx.sourceType,
    fileName: rx.fileName,
    patient: rx.patient ? toPatientSummary(rx.patient) : null,
    medicationSummary: rx.medicationSummary,
    findingCount: rx.findingCount,
    highestSeverity: rx.highestSeverity,
    progressStage: rx.progressStage as ProcessingStage,
    progressMessage: rx.progressMessage,
    progressPercent: rx.progressPercent,
    failureReason: rx.failureReason,
    createdAt: rx.createdAt.toISOString(),
    updatedAt: rx.updatedAt.toISOString(),
    reviewedAt: rx.reviewedAt ? rx.reviewedAt.toISOString() : null,
  };
}

export function toReview(r: Review): ReviewDto {
  return {
    id: r.id,
    prescriptionId: r.prescriptionId,
    action: r.action,
    pharmacistName: r.pharmacistName,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

export function parseStoredReport(raw: unknown): AnalysisReport | null {
  if (!raw) return null;
  const parsed = AnalysisReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function toDetail(
  rx: Prescription & { patient: PatientWithRelations | null; reviews: Review[] },
): PrescriptionDetail {
  return {
    ...toListItem(rx),
    rawText: rx.rawText,
    mimeType: rx.mimeType,
    patientContext: rx.patient ? toPatientContext(rx.patient) : null,
    report: parseStoredReport(rx.report),
    enteredData: rx.enteredData ? (EnteredScriptDataSchema.safeParse(rx.enteredData).data ?? null) : null,
    reviews: rx.reviews.map(toReview),
  };
}
