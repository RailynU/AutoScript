import { describe, expect, it } from "vitest";
import type { AnalysisReport, PrescriptionDetail } from "@/lib/shared";
import { buildSafetySummary, highestSeverity, isAiObservation, shortTitle } from "./safetySummary";

/** Finding as it sits in a parsed report (traceability fields filled by the schema). */
type ReportFinding = AnalysisReport["findings"][number];

function finding(over: Partial<ReportFinding>): ReportFinding {
  return {
    id: over.id ?? "f",
    type: "DRUG_INTERACTION",
    severity: "LOW",
    title: "t",
    explanation: "e",
    aiContext: null,
    origin: "interaction.pairwise/x",
    medications: [],
    evidence: [],
    reviewQuestions: [],
    deterministic: true,
    therapyContext: "UNKNOWN",
    therapyContextBasis: null,
    severitySource: "RULE_TABLE",
    supportStatus: null,
    proposedSeverity: null,
    ...over,
  };
}

function report(findings: ReportFinding[], medications: string[], patientName: string | null): AnalysisReport {
  return {
    prescriptionId: "p",
    disposition: "MANUAL_REVIEW_NEEDED",
    dispositionReason: "r",
    extraction: {
      patientName,
      patientDateOfBirth: null,
      prescriberName: null,
      prescriberIdentifier: null,
      dateWritten: null,
      medications: medications.map((rawName) => ({
        rawName,
        normalizedName: null,
        normalizationSource: "UNRESOLVED" as const,
        strength: null,
        form: null,
        route: null,
        sig: null,
        frequency: null,
        quantity: null,
        refills: null,
        duration: null,
        indication: null,
        confidence: 0.5,
      })),
      statedAllergies: [],
      notes: null,
      uncertainties: [],
      overallConfidence: 0.5,
      extractor: "test",
    },
    findings,
    evidence: [],
    ai: null,
    coverage: { rulesEvaluated: [], referenceDocumentsSearched: 0, retrievalMethod: "NONE", limitations: [], llmUsed: false },
    engineVersion: "0",
    startedAt: "2026-10-24T00:00:00Z",
    completedAt: "2026-10-24T00:00:01Z",
  };
}

function rx(over: Partial<PrescriptionDetail>): PrescriptionDetail {
  return {
    id: "p",
    externalRef: "RX-1",
    status: "MANUAL_REVIEW_NEEDED",
    reviewStatus: "PENDING_REVIEW",
    sourceType: "TEXT",
    fileName: null,
    patient: null,
    medicationSummary: [],
    findingCount: 0,
    highestSeverity: null,
    progressStage: "DONE",
    progressMessage: null,
    progressPercent: 100,
    failureReason: null,
    createdAt: "2026-10-24T00:00:00Z",
    updatedAt: "2026-10-24T00:00:00Z",
    reviewedAt: null,
    rawText: null,
    mimeType: null,
    patientContext: null,
    report: null,
    enteredData: null,
    reviews: [],
    ...over,
  };
}

describe("isAiObservation", () => {
  it("treats non-deterministic or llm-origin findings as AI", () => {
    expect(isAiObservation({ deterministic: false, origin: "x" })).toBe(true);
    expect(isAiObservation({ deterministic: true, origin: "llm" })).toBe(true);
    expect(isAiObservation({ deterministic: true, origin: "dose.daily-maximum" })).toBe(false);
  });
});

describe("highestSeverity", () => {
  it("returns null for no findings and the top rank otherwise", () => {
    expect(highestSeverity([])).toBeNull();
    expect(highestSeverity([finding({ severity: "LOW" }), finding({ severity: "HIGH" }), finding({ severity: "MODERATE" })])).toBe("HIGH");
  });
});

describe("shortTitle", () => {
  it("keeps the part before the first colon", () => {
    expect(shortTitle("No patient record linked: allergy checks incomplete")).toBe("No patient record linked");
    expect(shortTitle("Incomplete patient demographics")).toBe("Incomplete patient demographics");
  });
});

describe("buildSafetySummary", () => {
  it("separates supported severity from AI observations", () => {
    const findings = [
      finding({ id: "a", severity: "MODERATE" }),
      finding({ id: "b", severity: "CRITICAL", deterministic: false, origin: "llm", type: "AI_OBSERVATION" }),
    ];
    const s = buildSafetySummary(rx({ patient: { id: "x", firstName: "Ann", lastName: "Lee", dateOfBirth: null, phone: null }, report: report(findings, ["Ibuprofen"], "Ann Lee") }));
    expect(s.patientLabel).toBe("Ann Lee");
    expect(s.patientLinked).toBe(true);
    expect(s.highestSupportedSeverity).toBe("MODERATE");
    expect(s.highestAiSeverity).toBe("CRITICAL");
    expect(s.ruleFindingCount).toBe(1);
    expect(s.aiObservationCount).toBe(1);
    expect(s.medications).toEqual(["Ibuprofen"]);
    expect(s.missingPatientInfo).toEqual([]);
  });

  it("lists missing patient information from rule findings when no patient is linked", () => {
    const findings = [
      finding({ id: "a", type: "MISSING_PATIENT_INFO", severity: "HIGH", title: "No patient record linked: allergy and interaction checks incomplete" }),
      finding({ id: "b", type: "MISSING_PATIENT_INFO", severity: "LOW", title: "Incomplete patient demographics" }),
    ];
    const s = buildSafetySummary(rx({ report: report(findings, ["Metoprolol", "metoprolol"], "J. Whitfield") }));
    expect(s.patientLabel).toBe("No patient linked");
    expect(s.documentPatientName).toBe("J. Whitfield");
    expect(s.missingPatientInfo).toEqual(["No patient record linked", "Incomplete patient demographics"]);
    expect(s.medications).toEqual(["Metoprolol"]);
  });

  it("falls back to the list summary and flags the unlinked patient while processing", () => {
    const s = buildSafetySummary(rx({ status: "PROCESSING", medicationSummary: ["Amoxicillin"] }));
    expect(s.pending).toBe(true);
    expect(s.medications).toEqual(["Amoxicillin"]);
    expect(s.highestSupportedSeverity).toBeNull();
    expect(s.missingPatientInfo).toEqual(["No patient record linked"]);
  });
});
