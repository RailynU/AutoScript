import { describe, expect, it } from "vitest";
import { EMPTY_PATIENT_FORM, formatDob, parseList, toCreatePatient, toIsoDob } from "./patientForm";

describe("toIsoDob / formatDob", () => {
  it("accepts US and ISO dates and rejects impossible ones", () => {
    expect(toIsoDob("4/12/1985")).toBe("1985-04-12");
    expect(toIsoDob("1985-04-12")).toBe("1985-04-12");
    expect(toIsoDob("02/30/1985")).toBeNull();
    expect(toIsoDob("12-04-85")).toBeNull();
    expect(toIsoDob("")).toBeNull();
  });
  it("formats ISO for display", () => {
    expect(formatDob("1985-04-12")).toBe("04/12/1985");
    expect(formatDob(null)).toBe("—");
  });
});

describe("parseList", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseList("Penicillin (hives), Sulfa;\nLatex ,")).toEqual(["Penicillin (hives)", "Sulfa", "Latex"]);
  });
});

describe("toCreatePatient", () => {
  const base = { ...EMPTY_PATIENT_FORM, firstName: " Emily ", lastName: "Carter", dob: "04/12/1985", phone: "(555) 010-1001" };

  it("requires names and a valid DOB", () => {
    expect(toCreatePatient({ ...base, firstName: "" })).toBe("First and last name are required.");
    expect(typeof toCreatePatient({ ...base, dob: "13/01/1985" })).toBe("string");
  });

  it("keeps reactions, marks anaphylaxis severe and verifies the allergy history", () => {
    const body = toCreatePatient({ ...base, allergies: "Penicillin (anaphylaxis), Sulfa", medications: "Warfarin 5 mg", conditions: "AFib" });
    if (typeof body === "string") throw new Error(body);
    expect(body.firstName).toBe("Emily");
    expect(body.dateOfBirth).toBe("1985-04-12");
    expect(body.phone).toBe("5550101001");
    expect(body.allergiesVerified).toBe(true);
    expect(body.allergies).toEqual([
      { substance: "Penicillin", reaction: "anaphylaxis", severity: "SEVERE" },
      { substance: "Sulfa", reaction: null, severity: "UNKNOWN" },
    ]);
    expect(body.medications).toEqual([{ name: "Warfarin 5 mg", active: true }]);
    expect(body.conditions).toEqual([{ name: "AFib", status: "ACTIVE" }]);
  });

  it("records NKDA as a verified entry and ignores typed allergies", () => {
    const body = toCreatePatient({ ...base, nkda: true, allergies: "Sulfa" });
    if (typeof body === "string") throw new Error(body);
    expect(body.allergies).toEqual([{ substance: "NKDA", reaction: null, severity: "UNKNOWN" }]);
    expect(body.allergiesVerified).toBe(true);
  });

  it("leaves an empty allergy history unverified", () => {
    const body = toCreatePatient(base);
    if (typeof body === "string") throw new Error(body);
    expect(body.allergies).toEqual([]);
    expect(body.allergiesVerified).toBe(false);
  });
});
