import { describe, expect, it } from "vitest";
import type { ExtractedMedication, ExtractedPrescription } from "@/lib/shared";
import { assessExtraction, extractionState, medicationFlags, UNCERTAIN_BELOW, VERIFY_BELOW } from "./extractionState";

const completeMed: ExtractedMedication = {
  rawName: "Ibuprofen",
  normalizedName: "ibuprofen",
  normalizationSource: "LOCAL_MAP",
  strength: "600 mg",
  form: "tablet",
  route: "by mouth",
  sig: "Take 1 tablet every 8 hours",
  frequency: "every 8 hours",
  quantity: "21",
  refills: null,
  duration: null,
  indication: null,
  confidence: 1,
};

const completeExtraction: ExtractedPrescription = {
  patientName: "Margaret Holloway",
  patientDateOfBirth: "1952-03-14",
  prescriberName: "Dr. Example",
  prescriberIdentifier: null,
  dateWritten: "2026-10-24",
  medications: [completeMed],
  statedAllergies: [],
  notes: null,
  uncertainties: [],
  overallConfidence: 1,
  extractor: "test",
};

function withMed(patch: Partial<ExtractedMedication>, extra: Partial<ExtractedPrescription> = {}): ExtractedPrescription {
  return { ...completeExtraction, medications: [{ ...completeMed, ...patch }], ...extra };
}

describe("assessExtraction", () => {
  it("is FAILED when the prescription status is FAILED, regardless of extraction", () => {
    expect(assessExtraction({ status: "FAILED", extraction: completeExtraction })).toEqual({ state: "FAILED", reasons: ["STATUS_FAILED"] });
  });

  it("is FAILED when there is no extraction", () => {
    expect(assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: null })).toEqual({ state: "FAILED", reasons: ["NO_EXTRACTION"] });
  });

  it("is COMPLETED for a fully populated, high-confidence extraction", () => {
    expect(assessExtraction({ status: "NO_FLAGS_DETECTED", extraction: completeExtraction })).toEqual({ state: "COMPLETED", reasons: [] });
  });

  it("is UNCERTAIN just below the 0.7 overall threshold and VERIFY at it", () => {
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, overallConfidence: UNCERTAIN_BELOW - 0.001 } })).toBe("UNCERTAIN");
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, overallConfidence: UNCERTAIN_BELOW } })).toBe("VERIFY");
  });

  it("is VERIFY just below the 0.9 overall threshold and COMPLETED at it", () => {
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, overallConfidence: VERIFY_BELOW - 0.001 } })).toBe("VERIFY");
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, overallConfidence: VERIFY_BELOW } })).toBe("COMPLETED");
  });

  it("is UNCERTAIN when any medication line is below 0.7 even if overall is high", () => {
    const a = assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: withMed({ confidence: 0.69 }) });
    expect(a.state).toBe("UNCERTAIN");
    expect(a.reasons).toContain("LOW_LINE_CONFIDENCE");
  });

  it("is UNCERTAIN when a medication is UNRESOLVED", () => {
    const a = assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: withMed({ normalizedName: null, normalizationSource: "UNRESOLVED" }) });
    expect(a.state).toBe("UNCERTAIN");
    expect(a.reasons).toContain("UNRECOGNIZED_MEDICATION");
  });

  it("is UNCERTAIN when an uncertainty note mentions illegible or cut-off text", () => {
    for (const note of ["Prescriber signature illegible.", "Clinic stamp partially cut off.", "Quantity unreadable"]) {
      const a = assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, uncertainties: [note] } });
      expect(a.state, note).toBe("UNCERTAIN");
      expect(a.reasons).toContain("UNREADABLE_PARTS");
    }
  });

  it("is VERIFY (not UNCERTAIN) for an uncertainty note that is not about readability", () => {
    const a = assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: { ...completeExtraction, uncertainties: ["Date written is missing."] } });
    expect(a).toEqual({ state: "VERIFY", reasons: ["EXTRACTOR_NOTES"] });
  });

  it("is VERIFY when a line lacks strength, directions, route or quantity", () => {
    const cases: Array<Partial<ExtractedMedication>> = [{ strength: null }, { sig: null, frequency: null }, { route: null }, { quantity: null }];
    for (const patch of cases) {
      const a = assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: withMed(patch) });
      expect(a.state, JSON.stringify(patch)).toBe("VERIFY");
      expect(a.reasons).toContain("INCOMPLETE_LINE");
    }
  });

  it("still counts directions as present when only one of sig / frequency is set", () => {
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: withMed({ sig: null }) })).toBe("COMPLETED");
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: withMed({ frequency: null }) })).toBe("COMPLETED");
  });

  it("matches the two seeded demo prescriptions", () => {
    // RX-20261024191237-CFC5: overall 1, one complete LOCAL_MAP line, no uncertainties.
    expect(extractionState({ status: "MANUAL_REVIEW_NEEDED", extraction: completeExtraction })).toBe("COMPLETED");
    // RX-20261024184605-0FD6: overall 0.75, one UNRESOLVED line, "illegible" and "cut off" notes.
    const noPatient: ExtractedPrescription = {
      ...completeExtraction,
      overallConfidence: 0.75,
      uncertainties: ["Patient date of birth not legible.", "Prescriber signature illegible.", "Clinic stamp partially cut off, so prescriber name and identifier are unknown.", "Date written is missing."],
      medications: [
        { ...completeMed, rawName: "Metoprolol succinate", normalizedName: "metoprolol", strength: "50 mg", route: "PO", sig: "1 PO daily", frequency: "daily", quantity: "30", confidence: 0.95 },
        { ...completeMed, rawName: "Zelmoravix", normalizedName: null, normalizationSource: "UNRESOLVED", strength: "20 mg", route: "PO", sig: "1 tab PO qAM", frequency: "qAM", quantity: "30", confidence: 0.8 },
      ],
    };
    expect(assessExtraction({ status: "MANUAL_REVIEW_NEEDED", extraction: noPatient })).toEqual({
      state: "UNCERTAIN",
      reasons: ["UNRECOGNIZED_MEDICATION", "UNREADABLE_PARTS", "MODERATE_CONFIDENCE"],
    });
  });
});

describe("medicationFlags", () => {
  it("returns nothing for a complete, recognized, confident line", () => {
    expect(medicationFlags(completeMed)).toEqual([]);
  });

  it("flags UNRESOLVED lines as unrecognized", () => {
    expect(medicationFlags({ ...completeMed, normalizedName: null, normalizationSource: "UNRESOLVED" })).toEqual(["UNRECOGNIZED"]);
  });

  it("flags uncertain dosage for a missing strength or a line below 0.7", () => {
    expect(medicationFlags({ ...completeMed, strength: null })).toEqual(["UNCERTAIN_DOSAGE"]);
    expect(medicationFlags({ ...completeMed, confidence: 0.69 })).toEqual(["UNCERTAIN_DOSAGE"]);
    expect(medicationFlags({ ...completeMed, confidence: 0.7 })).toEqual([]);
  });

  it("flags ambiguous frequency only when both sig and frequency are absent", () => {
    expect(medicationFlags({ ...completeMed, sig: null })).toEqual([]);
    expect(medicationFlags({ ...completeMed, sig: null, frequency: null })).toEqual(["AMBIGUOUS_FREQUENCY"]);
  });

  it("flags missing route and quantity, in a stable order", () => {
    expect(medicationFlags({ ...completeMed, route: null, quantity: null, strength: null })).toEqual(["UNCERTAIN_DOSAGE", "MISSING_ROUTE", "MISSING_QUANTITY"]);
  });
});
