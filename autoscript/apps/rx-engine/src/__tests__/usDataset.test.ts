import { describe, expect, it } from "vitest";
import { groundTruthToExtraction, labelCase } from "../dataset/us/label.js";
import { createRng } from "../dataset/us/rng.js";
import { generateCase, type GeneratedCase } from "../dataset/us/scenarios.js";
import { ScenarioKind } from "../dataset/us/schema.js";
import { scoreExtraction } from "../dataset/us/score.js";

const RULE_FOR_SCENARIO: Record<Exclude<ScenarioKind, "CLEAN">, string> = {
  INTERACTION: "interaction.pairwise",
  ALLERGY: "allergy.cross-reactivity",
  DOSE: "dose.daily-maximum",
  DUPLICATE: "therapy.duplicate",
  CONDITION: "condition.contraindication",
  MISSING_FIELD: "rx.missing-fields",
  UNRECOGNIZED_DRUG: "rx.unresolved-drug",
};

describe("US synthetic generator", () => {
  it("is reproducible from the seed", () => {
    const a = generateCase(createRng(42), 0, "INTERACTION");
    const b = generateCase(createRng(42), 0, "INTERACTION");
    expect(a).toEqual(b);
    expect(generateCase(createRng(43), 0, "INTERACTION")).not.toEqual(a);
  });

  it("every injected error is caught by the production rules, and CLEAN cases raise nothing (200 cases per scenario)", () => {
    for (const scenario of ScenarioKind.options) {
      const rng = createRng(7);
      for (let i = 0; i < 200; i++) {
        const c = generateCase(rng, i, scenario);
        const label = labelCase(c);
        expect(label.consistency, `${scenario} #${i}: ${JSON.stringify(c.injectedErrors)} -> ${label.ruleFindings.map((f) => f.origin).join(",")}`).toBe("consistent");
        if (scenario === "CLEAN") {
          expect(label.verdict).toBe("good");
        } else {
          expect(label.verdict).toBe("bad");
          expect(label.ruleFindings.some((f) => f.origin.startsWith(RULE_FOR_SCENARIO[scenario]))).toBe(true);
        }
      }
    }
  });

  it("never emits a real-looking phone number", () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const c = generateCase(rng, i);
      expect(c.groundTruth.patient.phone).toMatch(/^555-01\d\d$/);
      expect(c.groundTruth.prescriber.phone).toMatch(/^555-02\d\d$/);
    }
  });
});

describe("scoreExtraction", () => {
  const c: GeneratedCase = generateCase(createRng(11), 0, "CLEAN");
  const perfect = groundTruthToExtraction(c.groundTruth);

  it("gives a perfect transcription 1.0", () => {
    const s = scoreExtraction(c.groundTruth, perfect);
    expect(s.overall).toBe(1);
    expect(s.medicationsMatched).toBe(c.groundTruth.medications.length);
  });

  it("accepts US date formats and brand/generic swaps, penalizes a wrong strength", () => {
    const first = perfect.medications[0]!;
    const s = scoreExtraction(c.groundTruth, {
      ...perfect,
      dateWritten: c.groundTruth.dateAsWritten,
      medications: [{ ...first, rawName: first.normalizedName ?? first.rawName, strength: "999 mg" }, ...perfect.medications.slice(1)],
    });
    expect(s.dateWritten).toBe(true);
    expect(s.medicationsMatched).toBe(c.groundTruth.medications.length);
    expect(s.strengthMatched).toBe(c.groundTruth.medications.length - 1);
    expect(s.overall).toBeLessThan(1);
  });

  it("counts a missed medication once, not per field", () => {
    const s = scoreExtraction(c.groundTruth, { ...perfect, medications: [] });
    expect(s.medicationsMatched).toBe(0);
    expect(s.strengthMatched).toBe(0);
    expect(s.overall).toBeCloseTo(3 / (3 + c.groundTruth.medications.length * 4), 3);
  });
});
