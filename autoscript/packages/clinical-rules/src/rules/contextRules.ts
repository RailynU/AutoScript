import { isNoKnownAllergyEntry } from "../allergies";
import type { Rule } from "../types";
import { finding } from "./helpers";

export const noPatientRule: Rule = {
  id: "context.no-patient",
  description: "Flags prescriptions that are not linked to a patient record, since allergy and interaction checks cannot be completed.",
  run({ patient, extraction }) {
    if (patient) return [];
    const named = extraction.patientName ? `The document names "${extraction.patientName}", but no matching patient record was linked.` : "The document does not identify the patient clearly.";
    return [
      finding({
        type: "MISSING_PATIENT_INFO",
        severity: "HIGH",
        title: "No patient record linked: allergy and interaction checks incomplete",
        explanation: `${named} Without a patient record the system could not check documented allergies, current medications, conditions, age or renal function. Any "no flags" outcome would be unreliable, so this prescription requires manual review.`,
        origin: "context.no-patient",
        medications: [],
        reviewQuestions: [
          "Can the patient be identified and matched to a profile (name, date of birth, phone)?",
          "Does the patient have any documented allergies or current medications?",
          "Should intake be paused until the patient profile is confirmed?",
        ],
        referenceIds: ["joint-commission-medication-reconciliation", "cfr-1306-05-prescription-requirements"],
        retrievalQuery: "pharmacist prescription verification patient identification allergy history requirement",
      }),
    ];
  },
};

export const allergyHistoryRule: Rule = {
  id: "context.allergy-history",
  description: "Flags patients whose allergy history is absent or unverified.",
  run({ patient }) {
    if (!patient) return [];
    const hasEntries = patient.allergies.length > 0;
    const hasNkda = patient.allergies.some((a) => isNoKnownAllergyEntry(a.substance));
    if (patient.allergiesVerified && (hasEntries || hasNkda)) return [];
    const reason = !hasEntries
      ? "The patient profile has no allergy entries at all (not even a 'no known drug allergies' record)."
      : "The patient profile carries allergy entries that were never verified with the patient.";
    return [
      finding({
        type: "MISSING_PATIENT_INFO",
        severity: "MODERATE",
        title: "Allergy history missing or unverified",
        explanation: `${reason} Allergy conflict checks were run against the available data only and cannot be considered complete.`,
        origin: "context.allergy-history",
        medications: [],
        reviewQuestions: [
          "Can the patient (or caregiver) confirm drug allergies and prior reactions before dispensing?",
          "Should the profile be updated to NKDA or with the confirmed allergens?",
        ],
        referenceIds: ["joint-commission-medication-reconciliation"],
        retrievalQuery: "allergy documentation medication reconciliation verification",
      }),
    ];
  },
};

export const demographicsRule: Rule = {
  id: "context.demographics",
  description: "Flags missing date of birth (age-dependent checks) and missing weight for weight-based dosing.",
  run({ patient }) {
    if (!patient) return [];
    const missing: string[] = [];
    if (!patient.dateOfBirth) missing.push("date of birth (age-based dosing and Beers criteria checks not possible)");
    if (missing.length === 0) return [];
    return [
      finding({
        type: "MISSING_PATIENT_INFO",
        severity: "LOW",
        title: "Incomplete patient demographics",
        explanation: `Missing: ${missing.join("; ")}.`,
        origin: "context.demographics",
        medications: [],
        reviewQuestions: ["Can the missing demographic data be confirmed at pickup?"],
        referenceIds: ["cfr-1306-05-prescription-requirements"],
        retrievalQuery: "prescription requirements patient date of birth",
      }),
    ];
  },
};
