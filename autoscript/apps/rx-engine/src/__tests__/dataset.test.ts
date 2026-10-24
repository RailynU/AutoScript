import { describe, expect, it } from "vitest";
import type { ExtractedPrescription } from "@autoscript/shared";
import { extractForDataset } from "../dataset/extractForDataset.js";
import { jpegDimensions } from "../dataset/jpeg.js";
import { redactDeep, redactString } from "../dataset/redact.js";
import { labelEntry, MIN_CONFIDENCE } from "../dataset/rubric.js";
import type { DocumentProfile } from "../dataset/schema.js";
import { FakeLlm } from "./fakeLlm.js";

const med = (over: Partial<ExtractedPrescription["medications"][number]> = {}): ExtractedPrescription["medications"][number] => ({
  rawName: "Warfarin", normalizedName: "warfarin", normalizationSource: "LOCAL_MAP", strength: "5 mg", form: "tablet", route: null,
  sig: "1 tablet daily", frequency: "daily", quantity: "30", refills: null, duration: null, indication: null, confidence: 0.95, ...over,
});
const rx = (over: Partial<ExtractedPrescription> = {}): ExtractedPrescription => ({
  patientName: "Patient 30", patientDateOfBirth: null, prescriberName: "Dr B. Who", prescriberIdentifier: null, dateWritten: "1994-11-01",
  medications: [med()], statedAllergies: [], notes: null, uncertainties: [], overallConfidence: 0.9, extractor: "fake", ...over,
});
const doc = (over: Partial<DocumentProfile> = {}): DocumentProfile => ({ type: "prescription", handwritten: "handwritten", language: "en", legibility: 0.9, qualityNotes: [], ...over });

describe("labelEntry", () => {
  it("labels a complete, legible prescription good with no issues", () => {
    const label = labelEntry(doc(), rx());
    expect(label.verdict).toBe("good");
    expect(label.issues).toEqual([]);
    expect(label.humanReviewed).toBe(false);
  });

  it("keeps warnings on a good example but blocks on missing directions", () => {
    const warned = labelEntry(doc(), rx({ dateWritten: null, medications: [med({ normalizedName: null, normalizationSource: "UNRESOLVED", quantity: null })] }));
    expect(warned.verdict).toBe("good");
    expect(warned.issues.map((i) => i.code)).toEqual(["MISSING_DATE", "MEDICATION_MISSING_QUANTITY", "UNRECOGNIZED_DRUG"]);

    const blocked = labelEntry(doc(), rx({ medications: [med({ sig: null, frequency: null })] }));
    expect(blocked.verdict).toBe("bad");
    expect(blocked.issues.map((i) => i.code)).toContain("MEDICATION_MISSING_DIRECTIONS");
  });

  it("marks non-prescriptions, illegible scans and low-confidence lines bad", () => {
    expect(labelEntry(doc({ type: "medical_certificate" }), rx({ medications: [] })).issues.map((i) => i.code)).toEqual(["NOT_A_PRESCRIPTION", "NO_MEDICATIONS"]);
    expect(labelEntry(doc({ legibility: 0.3 }), rx()).verdict).toBe("bad");
    expect(labelEntry(doc(), rx({ medications: [med({ confidence: MIN_CONFIDENCE - 0.01 })] })).issues[0]?.code).toBe("LOW_EXTRACTION_CONFIDENCE");
  });

  it("turns a deterministic interaction into a blocking CLINICAL_FLAG and records the finding", () => {
    const label = labelEntry(doc(), rx({ medications: [med(), med({ rawName: "Ibuprofen", normalizedName: "ibuprofen", strength: "600 mg", sig: "every 8 hours", frequency: "every 8 hours" })] }));
    expect(label.verdict).toBe("bad");
    expect(label.issues.some((i) => i.code === "CLINICAL_FLAG" && i.detail.startsWith("interaction.pairwise"))).toBe(true);
    expect(label.clinicalFindings[0]).toMatchObject({ type: "DRUG_INTERACTION", severity: "HIGH", origin: "interaction.pairwise/warfarin-nsaid" });
  });

  it("does not raise a MISSING_PATIENT finding from the context rules (dataset has no patient record)", () => {
    const label = labelEntry(doc(), rx());
    expect(label.clinicalFindings.map((f) => f.origin)).not.toContain("context.no-patient");
  });

  it("labels a failed extraction bad with EXTRACTION_FAILED", () => {
    expect(labelEntry(null, null).issues.map((i) => i.code)).toEqual(["EXTRACTION_FAILED"]);
  });
});

describe("redaction", () => {
  it("replaces phones, emails, urls and license numbers but keeps names", () => {
    const r = redactString("Dr. R. Keshwani, Mobile 98490 36918, drk@example.com, https://sites.example.com/x, Lic. No. 44832, 500 mg");
    expect(r.changed).toBe(true);
    expect(r.value).toContain("Dr. R. Keshwani");
    expect(r.value).toContain("500 mg");
    expect(r.value).not.toMatch(/98490|example\.com|44832/);
  });

  it("walks nested objects and reports whether anything changed", () => {
    const clean = redactDeep({ a: ["Digoxin 0.125 mg"], b: { c: "tel 3876" } });
    expect(clean).toEqual({ value: { a: ["Digoxin 0.125 mg"], b: { c: "tel 3876" } }, changed: false });
    const dirty = redactDeep({ notes: "call 0918 804 0304" });
    expect(dirty.changed).toBe(true);
    expect(dirty.value.notes).toBe("call [redacted]");
  });
});

describe("jpegDimensions", () => {
  it("reads the SOF0 frame header and rejects non-JPEG bytes", () => {
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x5f, 0x01, 0x30, 0x01, 0x01, 0x11, 0x00]);
    expect(jpegDimensions(sof)).toEqual({ width: 304, height: 351 });
    expect(jpegDimensions(Buffer.from("not a jpeg"))).toBeNull();
  });
});

describe("extractForDataset", () => {
  it("accepts the wrapped document+extraction shape and normalizes drug names locally", async () => {
    const llm = new FakeLlm([
      {
        document: { type: "prescription", handwritten: "handwritten", language: "en", legibility: 0.8, qualityNotes: [] },
        extraction: { medications: [{ rawName: "Coumadin", genericNameGuess: null, confidence: 0.9 }], overallConfidence: 0.8 },
      },
    ]);
    const out = await extractForDataset(llm, "1.jpg", "AAAA");
    expect(out.document.type).toBe("prescription");
    expect(out.extraction.medications[0]).toMatchObject({ normalizedName: "warfarin", normalizationSource: "LOCAL_MAP" });
    expect(out.model).toBe(llm.model);
  });

  it("repairs once, then fails", async () => {
    const llm = new FakeLlm([{ nope: true }, { still: "bad" }]);
    await expect(extractForDataset(llm, "1.jpg", "AAAA")).rejects.toThrow(/schema validation twice/);
    expect(llm.calls).toHaveLength(2);
  });
});
