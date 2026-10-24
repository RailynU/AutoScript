import { describe, expect, it } from "vitest";
import { extractPrescription, normalizeExtraction } from "../extraction/extract.js";
import { extractJson } from "../llm/client.js";
import { FakeLlm } from "./fakeLlm.js";

describe("normalizeExtraction", () => {
  it("prefers the local map over the model's generic guess and labels the source", () => {
    const out = normalizeExtraction(
      {
        patientName: null, patientDateOfBirth: null, prescriberName: null, prescriberIdentifier: null, dateWritten: null,
        medications: [
          { rawName: "Coumadin", genericNameGuess: "warfarin", strength: "5 mg", form: null, route: null, sig: null, frequency: null, quantity: null, refills: null, duration: null, indication: null, confidence: 0.9 },
          { rawName: "Brufenol", genericNameGuess: "ibuprofen", strength: null, form: null, route: null, sig: null, frequency: null, quantity: null, refills: null, duration: null, indication: null, confidence: 0.5 },
          { rawName: "Zelmoravix", genericNameGuess: null, strength: null, form: null, route: null, sig: null, frequency: null, quantity: null, refills: null, duration: null, indication: null, confidence: 0.5 },
        ],
        statedAllergies: [], notes: null, uncertainties: [], overallConfidence: 0.8,
      },
      "fake",
    );
    expect(out.medications[0]).toMatchObject({ normalizedName: "warfarin", normalizationSource: "LOCAL_MAP" });
    expect(out.medications[1]).toMatchObject({ normalizedName: "ibuprofen", normalizationSource: "LLM" });
    expect(out.medications[2]).toMatchObject({ normalizedName: null, normalizationSource: "UNRESOLVED" });
    expect("genericNameGuess" in out.medications[0]!).toBe(false);
  });
});

describe("extractPrescription", () => {
  it("repairs once when the first response fails schema validation", async () => {
    const llm = new FakeLlm([
      { medications: "not-an-array" },
      "```json\n" + JSON.stringify({ medications: [{ rawName: "Amoxicillin", confidence: 0.9 }], overallConfidence: 0.9 }) + "\n```",
    ]);
    const out = await extractPrescription(llm, { kind: "text", text: "Amoxicillin 500 mg TID" });
    expect(out.medications[0]!.normalizedName).toBe("amoxicillin");
    expect(llm.calls).toHaveLength(2);
    expect(String(llm.calls[1]![3]!.content)).toContain("did not match the required schema");
  });

  it("uses the vision model and an image_url part for images", async () => {
    const llm = new FakeLlm([{ medications: [], overallConfidence: 0.2, uncertainties: ["blurry"] }]);
    await extractPrescription(llm, { kind: "file", fileName: "rx.png", mimeType: "image/png", base64: Buffer.from("png").toString("base64") });
    const user = llm.calls[0]![1]!;
    expect(Array.isArray(user.content) && user.content.some((p) => p.type === "image_url")).toBe(true);
  });

  it("renders scanned PDFs (no text layer) to PNG for the vision model", async () => {
    const llm = new FakeLlm([{ medications: [], overallConfidence: 0.2, uncertainties: ["scanned"] }]);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    await extractPrescription(llm, { kind: "file", fileName: "scan.pdf", mimeType: "application/pdf", base64: Buffer.from(bytes).toString("base64") });
    const user = llm.calls[0]![1]!;
    expect(Array.isArray(user.content) && user.content.some((p) => p.type === "image_url" && p.image_url.url.startsWith("data:image/png;base64,"))).toBe(true);
  });
});

describe("extractJson", () => {
  it("handles fences and leading prose", () => {
    expect(extractJson('Sure! ```json {"a":1} ```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} thanks')).toEqual({ a: { b: 2 } });
  });
});

describe("extractPrescription with non-JSON responses", () => {
  const valid = { patientName: "Pat", medications: [{ rawName: "Warfarin", confidence: 0.9 }], overallConfidence: 0.9 };

  it("treats a prose response as a schema failure and repairs it", async () => {
    const llm = new FakeLlm(["I cannot read this image.", valid]);
    const out = await extractPrescription(llm, { kind: "text", text: "Warfarin 5 mg daily" });
    expect(out.patientName).toBe("Pat");
    expect(llm.calls).toHaveLength(2);
  });

  it("throws instead of returning an empty extraction when both responses are not JSON", async () => {
    const llm = new FakeLlm(["", "still nothing"]);
    await expect(extractPrescription(llm, { kind: "text", text: "Warfarin 5 mg daily" })).rejects.toThrow(/failed schema validation twice/);
  });
});
