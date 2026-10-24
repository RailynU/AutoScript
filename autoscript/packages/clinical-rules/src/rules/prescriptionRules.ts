import type { Rule, RuleFinding } from "../types";
import { finding, resolvePrescribed } from "./helpers";

export const missingFieldsRule: Rule = {
  id: "rx.missing-fields",
  description: "Flags medication lines that lack strength, directions, or quantity, and documents missing prescriber or date.",
  run({ extraction }) {
    const findings: RuleFinding[] = [];
    for (const med of extraction.medications) {
      const missing: string[] = [];
      if (!med.strength) missing.push("strength");
      if (!med.sig && !med.frequency) missing.push("directions / frequency");
      if (!med.quantity && !med.duration) missing.push("quantity or duration");
      if (missing.length === 0) continue;
      findings.push(
        finding({
          type: "MISSING_PRESCRIPTION_INFO",
          severity: missing.includes("strength") || missing.includes("directions / frequency") ? "MODERATE" : "LOW",
          title: `${med.rawName}: missing ${missing.join(", ")}`,
          explanation: `The extracted line for ${med.rawName} has no ${missing.join(", ")}. Dose-based checks for this medication were skipped and the prescription cannot be filled as written without clarification.`,
          origin: "rx.missing-fields",
          medications: [med.normalizedName ?? med.rawName],
          reviewQuestions: [`Contact the prescriber to confirm ${missing.join(" and ")} for ${med.rawName}.`],
          referenceIds: ["cfr-1306-05-prescription-requirements"],
          retrievalQuery: "prescription required elements strength directions quantity",
        }),
      );
    }
    const headerMissing: string[] = [];
    if (!extraction.prescriberName) headerMissing.push("prescriber name");
    if (!extraction.dateWritten) headerMissing.push("date written");
    if (headerMissing.length > 0) {
      findings.push(
        finding({
          type: "MISSING_PRESCRIPTION_INFO",
          severity: "LOW",
          title: `Prescription header missing ${headerMissing.join(" and ")}`,
          explanation: `The extractor did not find a ${headerMissing.join(" or ")} on the document.`,
          origin: "rx.missing-fields",
          medications: [],
          reviewQuestions: ["Verify the prescriber identity and prescription date before dispensing."],
          referenceIds: ["cfr-1306-05-prescription-requirements"],
          retrievalQuery: "prescription required elements prescriber date",
        }),
      );
    }
    return findings;
  },
};

export const unresolvedDrugRule: Rule = {
  id: "rx.unresolved-drug",
  description: "Flags medication names the normalizer could not map to a known generic; those drugs were excluded from interaction and allergy checks.",
  run({ extraction }) {
    const { unresolved } = resolvePrescribed(extraction.medications);
    return unresolved.map((med) =>
      finding({
        type: "EXTRACTION_UNCERTAINTY",
        severity: "MODERATE",
        title: `Unrecognized drug name: "${med.rawName}"`,
        explanation: `"${med.rawName}" is not in the local normalization map, so it was NOT checked for interactions, allergies, duplicates or dose limits. This is a coverage gap of the demo system, not a statement that the drug is safe.`,
        origin: "rx.unresolved-drug",
        medications: [med.rawName],
        reviewQuestions: [`Confirm the intended drug for "${med.rawName}" and check it manually against the patient's allergies and medications.`],
        referenceIds: ["autoscript-coverage-limitations"],
        retrievalQuery: `${med.rawName}`,
      }),
    );
  },
};

export const lowConfidenceRule: Rule = {
  id: "rx.extraction-confidence",
  description: "Flags prescriptions where extraction confidence is low or the extractor reported unreadable parts.",
  run({ extraction }) {
    const findings: RuleFinding[] = [];
    const lowConfidence = extraction.overallConfidence < 0.7;
    const uncertainMeds = extraction.medications.filter((m) => m.confidence < 0.6);
    if (!lowConfidence && extraction.uncertainties.length === 0 && uncertainMeds.length === 0) return findings;
    // The extractor's self-reported confidence is not calibrated: it is used as a threshold, never shown as a number.
    const parts: string[] = [];
    if (lowConfidence) parts.push("the extractor reported low confidence in its own reading of the document");
    if (uncertainMeds.length > 0) parts.push(`the extractor reported low confidence on: ${uncertainMeds.map((m) => m.rawName).join(", ")}`);
    if (extraction.uncertainties.length > 0) parts.push(`extractor notes: ${extraction.uncertainties.join("; ")}`);
    findings.push(
      finding({
        type: "EXTRACTION_UNCERTAINTY",
        severity: lowConfidence ? "HIGH" : "MODERATE",
        title: "Document extraction uncertainty",
        explanation: `Parts of the document could not be read with confidence (${parts.join("; ")}). All downstream checks depend on this extraction, so verify every field against the original document.`,
        origin: "rx.extraction-confidence",
        medications: uncertainMeds.map((m) => m.rawName),
        reviewQuestions: ["Compare the extracted medications against the original document before relying on any automated check."],
        referenceIds: ["autoscript-coverage-limitations"],
        retrievalQuery: "prescription legibility verification",
      }),
    );
    if (extraction.medications.length === 0) {
      findings.push(
        finding({
          type: "EXTRACTION_UNCERTAINTY",
          severity: "HIGH",
          title: "No medications could be extracted",
          explanation: "The extractor returned zero medication lines. Nothing could be checked.",
          origin: "rx.extraction-confidence",
          medications: [],
          reviewQuestions: ["Is this document actually a prescription? Re-upload a clearer copy if so."],
          referenceIds: ["autoscript-coverage-limitations"],
          retrievalQuery: "prescription legibility verification",
        }),
      );
    }
    return findings;
  },
};
