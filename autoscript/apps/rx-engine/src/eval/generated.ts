import type { Disposition } from "@autoscript/shared";
import { labelCase } from "../dataset/us/label.js";
import type { RenderDifficulty, RenderStyle } from "../dataset/us/render.js";
import { createRng } from "../dataset/us/rng.js";
import { generateCase } from "../dataset/us/scenarios.js";
import { familyOf, RULE_FOR_SCENARIO, SCENARIO_FAMILIES, type RuleFamily } from "./families.js";
import { groundTruthToLlmExtraction } from "./oracle.js";
import type { EvalCaseSpec } from "./types.js";

export const DEFAULT_EVAL_SEED = 7;
export const DEFAULT_EVAL_COUNT = 30;
/** Seed of datasets/us-synthetic (apps/rx-engine/scripts/build-us-dataset.ts), whose cases are ingested into case_examples. */
export const INGESTED_EXAMPLES_SEED = 20261024;
const RENDER_SEED_MAX = 2 ** 31 - 1;
/** Text of the limitations runRules emits for these injected errors (packages/clinical-rules/src/runRules.ts). */
const UNRESOLVED_LIMITATION = "could not be normalized";
const UNDOSED_LIMITATION = "lacked strength or frequency";

function expectedLimitations(c: ReturnType<typeof generateCase>): string[] {
  const codes = new Set(c.injectedErrors.map((e) => e.code));
  const out: string[] = ["curated demo tables"];
  if (codes.has("UNRECOGNIZED_DRUG")) out.push(UNRESOLVED_LIMITATION);
  if (codes.has("MISSING_STRENGTH") || codes.has("MISSING_DIRECTIONS")) out.push(UNDOSED_LIMITATION);
  return out;
}

/**
 * Held-out cases from the same generator as the ingested examples, under a different seed. Expected findings
 * come from the injected error (RULE_FOR_SCENARIO); expected-absent families are the generator families the
 * deterministic rules do not raise on the exact ground truth, so a firing there can only come from extraction.
 */
export function generatedCaseSpecs(seed: number, count: number): EvalCaseSpec[] {
  if (seed === INGESTED_EXAMPLES_SEED) {
    throw new Error(`seed ${seed} is the seed of the ingested us-synthetic examples; pick another seed for a held-out set`);
  }
  const rng = createRng(seed);
  const specs: EvalCaseSpec[] = [];
  for (let i = 0; i < count; i++) {
    const generated = generateCase(rng, i);
    const style: RenderStyle = rng.chance(0.5) ? "printed" : "handwritten";
    const difficulty: RenderDifficulty = rng.chance(0.3) ? "noisy" : "clean";
    const renderSeed = rng.int(0, RENDER_SEED_MAX);
    const label = labelCase(generated);
    const findings: RuleFamily[] = generated.scenario === "CLEAN" ? [] : [RULE_FOR_SCENARIO[generated.scenario]];
    const labelFamilies = new Set(label.ruleFindings.map((f) => familyOf(f.origin)));
    const absent = SCENARIO_FAMILIES.filter((f) => !labelFamilies.has(f) && !findings.includes(f));
    const disposition: Disposition = generated.scenario === "CLEAN" ? "NO_FLAGS_DETECTED" : "MANUAL_REVIEW_NEEDED";
    specs.push({
      id: `gen-s${seed}-${String(i + 1).padStart(3, "0")}`,
      title: `${generated.scenario} (${style}/${difficulty})${generated.injectedErrors.map((e) => `: ${e.detail}`).join("")}`,
      set: "generated",
      scenario: generated.scenario,
      source: { kind: "render", groundTruth: generated.groundTruth, style, difficulty, seed: renderSeed },
      patient: generated.groundTruth.patient,
      oracleExtraction: groundTruthToLlmExtraction(generated.groundTruth),
      groundTruth: generated.groundTruth,
      injectedErrors: generated.injectedErrors,
      expected: {
        findings,
        absent,
        therapyContext: null,
        limitations: expectedLimitations(generated),
        disposition,
        forbiddenWords: [],
        evidence: [],
        absentEvidence: [],
      },
    });
  }
  return specs;
}
