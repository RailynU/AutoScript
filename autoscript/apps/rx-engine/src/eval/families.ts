import { ALL_RULES } from "@autoscript/clinical-rules";
import type { ScenarioKind } from "../dataset/us/schema.js";

/**
 * A "family" is a rule origin prefix: the rule id ("interaction.pairwise") or the rule id plus a table entry
 * ("interaction.pairwise/warfarin-nsaid"). A fired finding matches a family when its origin starts with it.
 */
export type RuleFamily = string;

/** Every deterministic rule id the engine evaluates, in the order the engine runs them. */
export const ALL_RULE_FAMILIES: readonly RuleFamily[] = ALL_RULES.map((r) => r.id);

/**
 * Rule family the generator's injected error maps to, per scenario. Mirrors RULE_FOR_SCENARIO in
 * src/__tests__/usDataset.test.ts, where the generator is proven to trigger exactly these rules.
 */
export const RULE_FOR_SCENARIO: Record<Exclude<ScenarioKind, "CLEAN">, RuleFamily> = {
  INTERACTION: "interaction.pairwise",
  ALLERGY: "allergy.cross-reactivity",
  DOSE: "dose.daily-maximum",
  DUPLICATE: "therapy.duplicate",
  CONDITION: "condition.contraindication",
  MISSING_FIELD: "rx.missing-fields",
  UNRECOGNIZED_DRUG: "rx.unresolved-drug",
};

/** The families the generator can inject; the universe of labelled negatives for a generated case. */
export const SCENARIO_FAMILIES: readonly RuleFamily[] = Object.values(RULE_FOR_SCENARIO);

/** Origin of the engine's own "AI step did not complete" finding; deterministic, but not a rule. */
export const SYSTEM_ORIGIN = "system";

/** The rule id part of an origin ("interaction.pairwise/warfarin-nsaid" -> "interaction.pairwise"). */
export function familyOf(origin: string): RuleFamily {
  return origin.split("/")[0]!;
}

export function originMatches(origin: string, family: RuleFamily): boolean {
  return origin === family || origin.startsWith(`${family}/`);
}

/** Every rule family except the given ones (for "nothing else may fire" expectations). */
export function allFamiliesExcept(...excluded: RuleFamily[]): RuleFamily[] {
  return ALL_RULE_FAMILIES.filter((f) => !excluded.some((e) => originMatches(e, f) || originMatches(f, e)));
}
