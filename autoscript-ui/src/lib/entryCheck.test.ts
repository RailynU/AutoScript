import { describe, expect, it } from "vitest";
import type { ExtractedMedication, ExtractedPrescription, Finding } from "@/lib/shared";
import { groupFindings } from "./checksCoverage";
import {
  applyAutofill,
  buildEntryRows,
  EMPTY_ENTRY_FORM,
  entryFieldOf,
  entryFormComplete,
  entryFormError,
  matchLine,
  toEnteredData,
} from "./entryCheck";

function med(over: Partial<ExtractedMedication>): ExtractedMedication {
  return {
    rawName: "Lisinopril",
    normalizedName: "lisinopril",
    normalizationSource: "LOCAL_MAP",
    strength: "10 mg",
    form: "tablet",
    route: "by mouth",
    sig: "Take 1 tablet daily",
    frequency: "daily",
    quantity: "30",
    refills: "2",
    duration: "30 days",
    indication: null,
    confidence: 0.95,
    ...over,
  };
}

const extraction: ExtractedPrescription = {
  patientName: "Emily Carter",
  patientDateOfBirth: "1985-04-12",
  prescriberName: "Dr. Alan Reyes",
  prescriberIdentifier: "NPI 1999999901",
  dateWritten: null,
  medications: [med({ rawName: "Ibuprofen", normalizedName: "ibuprofen", strength: "600 mg" }), med({})],
  statedAllergies: [],
  notes: null,
  uncertainties: [],
  overallConfidence: 0.95,
  extractor: "test",
};

function finding(over: Partial<Finding>): Finding {
  return {
    id: over.id ?? "f",
    type: "DATA_ENTRY_MISMATCH",
    severity: "HIGH",
    title: "Entered quantity does not match the script",
    explanation: "e",
    aiContext: null,
    origin: "entry.verify/quantity",
    medications: [],
    evidence: [],
    reviewQuestions: [],
    deterministic: true,
    ...over,
  };
}

describe("entryFieldOf", () => {
  it("reads the field from the rule origin and folds strength into the drug row", () => {
    expect(entryFieldOf({ origin: "entry.verify/quantity" })).toBe("quantity");
    expect(entryFieldOf({ origin: "entry.verify/drugStrength" })).toBe("drugName");
    expect(entryFieldOf({ origin: "interaction.pairwise/x" })).toBeNull();
    expect(entryFieldOf({ origin: "entry.verify/unknownField" })).toBeNull();
  });
});

describe("matchLine", () => {
  it("prefers the line named in the typed drug, else the first", () => {
    expect(matchLine(extraction.medications, "Lisinopril 20 mg")?.rawName).toBe("Lisinopril");
    expect(matchLine(extraction.medications, "Atorvastatin")?.rawName).toBe("Ibuprofen");
    expect(matchLine([], "x")).toBeNull();
  });
});

describe("buildEntryRows", () => {
  it("lays the entry next to the script and attaches mismatch findings to their rows", () => {
    const rows = buildEntryRows(
      { patientFirstName: "Emily", patientLastName: "Carter", drugName: "Lisinopril 20 mg", quantity: 90, refillCount: 2 },
      extraction,
      [finding({ id: "q" }), finding({ id: "s", origin: "entry.verify/drugStrength" }), finding({ id: "x", type: "DRUG_INTERACTION", origin: "interaction.pairwise/a" })],
    );
    const by = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(by.patientName!.entered).toBe("Emily Carter");
    expect(by.patientName!.onScript).toBe("Emily Carter");
    expect(by.drugName!.onScript).toBe("Lisinopril 10 mg");
    expect(by.drugName!.mismatches.map((f) => f.id)).toEqual(["s"]);
    expect(by.quantity!.entered).toBe("90");
    expect(by.quantity!.mismatches.map((f) => f.id)).toEqual(["q"]);
    expect(by.refillCount!.mismatches).toEqual([]);
    expect(by.directions!.entered).toBeNull();
    expect(by.prescriberNpi!.onScript).toBe("NPI 1999999901");
  });

  it("shows nothing on the script side before extraction", () => {
    const rows = buildEntryRows({ drugName: "Lisinopril" }, null, []);
    expect(rows.every((r) => r.onScript === null)).toBe(true);
  });
});

describe("entry form", () => {
  const filled = { ...EMPTY_ENTRY_FORM, drugName: "Lisinopril 10 mg", directions: "1 daily", quantity: "30" };

  it("requires drug, directions and quantity and enforces the API limits", () => {
    expect(entryFormComplete(EMPTY_ENTRY_FORM)).toBe(false);
    expect(entryFormComplete(filled)).toBe(true);
    expect(entryFormError({ ...filled, quantity: "0" })).toMatch(/Quantity/);
    expect(entryFormError({ ...filled, daySupply: "400" })).toMatch(/Day supply/);
    expect(entryFormError({ ...filled, refills: "1.5" })).toMatch(/Refills/);
    expect(entryFormError({ ...filled, npi: "123" })).toMatch(/NPI/);
    expect(entryFormError({ ...filled, npi: "199-999-9901" })).toBeNull();
  });

  it("builds enteredData with the selected patient's identity", () => {
    const data = toEnteredData({ ...filled, refills: "2", npi: "199-999-9901" }, { id: "p", firstName: "Emily", lastName: "Carter", dateOfBirth: "1985-04-12", phone: null });
    expect(data).toMatchObject({ patientFirstName: "Emily", patientDateOfBirth: "1985-04-12", quantity: 30, refillCount: 2, daySupply: null, prescriberNpi: "1999999901" });
    expect(toEnteredData(filled, null).patientFirstName).toBeNull();
  });

  it("autofill overwrites only the fields the extractor returned", () => {
    const next = applyAutofill({ ...filled, prescriberName: "Dr. Typed" }, { drugName: "Ibuprofen 600 mg", quantity: 21, prescriberName: null });
    expect(next.drugName).toBe("Ibuprofen 600 mg");
    expect(next.quantity).toBe("21");
    expect(next.directions).toBe("1 daily");
    expect(next.prescriberName).toBe("Dr. Typed");
  });
});

describe("groupFindings", () => {
  it("puts data entry mismatches in their own group, first", () => {
    const groups = groupFindings([finding({ id: "a", type: "DOSE_CONCERN", origin: "dose.daily-maximum" }), finding({ id: "b" })], extraction);
    expect(groups.map((g) => g.group)).toEqual(["ENTRY", "PRESCRIPTION"]);
  });
});
