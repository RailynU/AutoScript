import type { DrugClass } from "./drugs";
import { lookupDrug } from "./drugs";

/**
 * Maps a recorded allergen (free text) to drug classes it implicates.
 * Cross-reactivity rules are deliberately conservative: the pharmacist decides.
 */
export interface AllergenClassRule {
  /** Lower-case substrings that identify the allergen in a patient record. */
  match: string[];
  /** Classes that directly conflict (same class as the allergen). */
  directClasses: DrugClass[];
  /** Classes with documented partial cross-reactivity that warrant assessment. */
  crossReactiveClasses: DrugClass[];
  label: string;
  referenceIds: string[];
}

export const ALLERGEN_RULES: AllergenClassRule[] = [
  {
    match: ["penicillin", "pcn", "amoxicillin", "ampicillin", "augmentin", "amoxil"],
    directClasses: ["PENICILLIN"],
    crossReactiveClasses: ["CEPHALOSPORIN"],
    label: "penicillin-class antibiotic",
    referenceIds: [
      "fda-amoxicillin-label-contraindications",
      "aaaai-penicillin-allergy-evaluation",
      "cephalosporin-cross-reactivity",
    ],
  },
  {
    match: ["cephalosporin", "cephalexin", "keflex", "ceftriaxone", "cefdinir"],
    directClasses: ["CEPHALOSPORIN"],
    crossReactiveClasses: ["PENICILLIN"],
    label: "cephalosporin antibiotic",
    referenceIds: ["cephalosporin-cross-reactivity"],
  },
  {
    match: ["sulfa", "sulfonamide", "bactrim", "septra", "sulfamethoxazole"],
    directClasses: ["SULFONAMIDE"],
    crossReactiveClasses: [],
    label: "sulfonamide antibiotic",
    referenceIds: ["fda-smx-tmp-label-contraindications"],
  },
  {
    match: ["nsaid", "ibuprofen", "advil", "motrin", "naproxen", "aleve"],
    directClasses: ["NSAID"],
    crossReactiveClasses: ["SALICYLATE"],
    label: "NSAID",
    referenceIds: ["fda-ibuprofen-label-anticoagulants"],
  },
  {
    match: ["aspirin", "salicylate"],
    directClasses: ["SALICYLATE"],
    crossReactiveClasses: ["NSAID"],
    label: "salicylate",
    referenceIds: ["fda-ibuprofen-label-anticoagulants"],
  },
  {
    match: ["codeine", "opioid", "morphine", "oxycodone", "hydrocodone", "tramadol"],
    directClasses: ["OPIOID"],
    crossReactiveClasses: [],
    label: "opioid",
    referenceIds: [],
  },
];

export interface AllergyMatch {
  rule: AllergenClassRule;
  kind: "DIRECT" | "CROSS_REACTIVE" | "EXACT_SUBSTANCE";
}

const NO_KNOWN_ALLERGY_MARKERS = ["nkda", "nka", "no known", "none"];

export function isNoKnownAllergyEntry(substance: string): boolean {
  const s = substance.toLowerCase().trim();
  return NO_KNOWN_ALLERGY_MARKERS.some((m) => s === m || s.startsWith(m));
}

/** Check one recorded allergen against a normalized medication. */
export function matchAllergy(
  allergenSubstance: string,
  medication: { generic: string; classes: DrugClass[] },
): AllergyMatch | null {
  const allergen = allergenSubstance.toLowerCase();
  if (isNoKnownAllergyEntry(allergen)) return null;

  // Exact substance match (allergen text normalizes to the same generic).
  const allergenDrug = lookupDrug(allergen);
  if (allergenDrug && allergenDrug.generic === medication.generic) {
    const rule = ALLERGEN_RULES.find((r) => r.match.some((m) => allergen.includes(m)));
    return {
      kind: "EXACT_SUBSTANCE",
      rule: rule ?? {
        match: [allergen],
        directClasses: [],
        crossReactiveClasses: [],
        label: allergenDrug.generic,
        referenceIds: [],
      },
    };
  }

  for (const rule of ALLERGEN_RULES) {
    if (!rule.match.some((m) => allergen.includes(m))) continue;
    if (rule.directClasses.some((c) => medication.classes.includes(c))) {
      return { kind: "DIRECT", rule };
    }
    if (rule.crossReactiveClasses.some((c) => medication.classes.includes(c))) {
      return { kind: "CROSS_REACTIVE", rule };
    }
  }
  return null;
}
