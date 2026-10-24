import { ALL_RULES, RULES_VERSION, normalizeDrugName, runRules } from "@autoscript/clinical-rules";
import type { ExtractedPrescription } from "@autoscript/shared";
import type { GeneratedCase } from "./scenarios.js";
import type { GroundTruth, UsDatasetEntry } from "./schema.js";

/** The transcription a perfect reader would produce from the rendered image. */
export function groundTruthToExtraction(gt: GroundTruth): ExtractedPrescription {
  return {
    patientName: `${gt.patient.firstName} ${gt.patient.lastName}`,
    patientDateOfBirth: gt.patient.dateOfBirth,
    prescriberName: gt.prescriber.name,
    prescriberIdentifier: gt.prescriber.npi,
    dateWritten: gt.dateWritten,
    medications: gt.medications.map((m) => {
      const { generic } = normalizeDrugName(m.writtenName);
      return {
        rawName: m.writtenName,
        normalizedName: generic,
        normalizationSource: generic ? ("LOCAL_MAP" as const) : ("UNRESOLVED" as const),
        strength: m.strength,
        form: m.form,
        route: m.route,
        sig: m.sig,
        frequency: null,
        quantity: m.quantity,
        refills: m.refills,
        duration: null,
        indication: m.indication,
        confidence: 1,
      };
    }),
    statedAllergies: gt.allergiesOnScript ? [gt.allergiesOnScript] : [],
    notes: gt.notes,
    uncertainties: [],
    overallConfidence: 1,
    extractor: "ground-truth",
  };
}

/** Runs the production rules on the ground truth + patient record and compares with what was injected. */
export function labelCase(c: GeneratedCase): UsDatasetEntry["label"] {
  const result = runRules({ extraction: groundTruthToExtraction(c.groundTruth), patient: c.groundTruth.patient }, ALL_RULES);
  const findings = result.findings.map((f) => ({ id: f.id, type: f.type, severity: f.severity, title: f.title, explanation: f.explanation, origin: f.origin, medications: f.medications, referenceIds: f.referenceIds }));
  const injected = c.injectedErrors.length > 0;
  const flagged = findings.length > 0;
  return {
    verdict: injected || flagged ? "bad" : "good",
    ruleFindings: findings,
    consistency: injected === flagged ? "consistent" : injected ? "rules-missed" : "rules-extra",
    rulesVersion: RULES_VERSION,
    labelSource: "ground-truth+deterministic-rules",
  };
}
