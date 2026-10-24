import type { Allergy, Severity } from "@autoscript/shared";
import { prescriptionDate, yearsSince } from "../age";
import { matchAllergy, type AllergyMatch } from "../allergies";
import type { Rule, RuleFinding } from "../types";
import { finding, resolvePrescribed } from "./helpers";

/**
 * Years after which a documented non-severe reaction counts as remote. The 2022 AAAAI/ACAAI drug allergy
 * practice parameter classes a distant (more than 5 years) benign cutaneous reaction as a low-risk history
 * (reference aaaai-penicillin-allergy-evaluation, section "Risk stratification").
 */
export const REMOTE_REACTION_YEARS = 5;

export interface AllergySeverityResult {
  severity: Severity;
  /** One sentence saying why this severity, shown in the finding so the grading is auditable. */
  basis: string;
}

/**
 * Severity of an allergy conflict. Downgrade-only relative to the previous rule (every direct match was HIGH):
 * - cross-reactive class match: MODERATE (partial cross-reactivity, not the recorded substance);
 * - recorded SEVERE: CRITICAL (the amoxicillin label contraindicates re-exposure after a serious reaction);
 * - recorded MILD or MODERATE, with a reaction described, recorded `REMOTE_REACTION_YEARS` or more before the
 *   prescription date: MODERATE (low-risk history per the 2022 practice parameter; still manual review);
 * - anything else (UNKNOWN severity, no reaction details, recent or undated record): HIGH, because a serious
 *   reaction cannot be excluded from the record.
 * The record's severity grade is taken as given; the rule does not parse the reaction text.
 */
export function allergySeverity(kind: AllergyMatch["kind"], allergy: Allergy, asOf: Date): AllergySeverityResult {
  if (kind === "CROSS_REACTIVE") {
    return { severity: "MODERATE", basis: "Graded MODERATE: the match is class-level cross-reactivity, not the recorded substance." };
  }
  if (allergy.severity === "SEVERE") {
    return { severity: "CRITICAL", basis: "Graded CRITICAL: the reaction is recorded as SEVERE, and labeling contraindicates re-exposure after a serious hypersensitivity reaction." };
  }
  if (allergy.severity === "UNKNOWN") {
    return { severity: "HIGH", basis: "Graded HIGH: the recorded severity is UNKNOWN, so a serious reaction cannot be excluded." };
  }
  if (!allergy.reaction?.trim()) {
    return { severity: "HIGH", basis: `Graded HIGH: the reaction is recorded as ${allergy.severity} but no reaction details are documented.` };
  }
  const years = yearsSince(allergy.recordedAt, asOf);
  if (years == null) {
    return { severity: "HIGH", basis: `Graded HIGH: the reaction is recorded as ${allergy.severity} but the record carries no usable date, so it cannot be treated as remote.` };
  }
  if (years < REMOTE_REACTION_YEARS) {
    return { severity: "HIGH", basis: `Graded HIGH: the ${allergy.severity} reaction was recorded ${years} year(s) before this prescription, within the ${REMOTE_REACTION_YEARS}-year window the 2022 practice parameter uses for a recent history.` };
  }
  return {
    severity: "MODERATE",
    basis: `Graded MODERATE: the reaction is recorded as ${allergy.severity} with details, ${years} years before this prescription; the 2022 AAAAI/ACAAI practice parameter classes a distant (more than ${REMOTE_REACTION_YEARS} years) benign reaction as low risk. Whether the reaction was in fact benign must be confirmed; the record's grade is not a clinical assessment.`,
  };
}

function relationSentence(match: AllergyMatch): string {
  switch (match.kind) {
    case "CROSS_REACTIVE":
      return `belongs to a class with documented partial cross-reactivity to the recorded ${match.rule.label} allergy`;
    case "EXACT_SUBSTANCE":
      return "is the same substance as the recorded allergy";
    case "DIRECT":
      return `is a ${match.rule.label}, the same class as the recorded allergy`;
  }
}

export const allergyRule: Rule = {
  id: "allergy.cross-reactivity",
  description: "Checks each prescribed drug against documented patient allergies, including class-level cross-reactivity.",
  run({ extraction, patient }) {
    if (!patient) return [];
    const { resolved } = resolvePrescribed(extraction.medications);
    const asOf = prescriptionDate(extraction.dateWritten);
    const findings: RuleFinding[] = [];
    for (const med of resolved) {
      for (const allergy of patient.allergies) {
        const match = matchAllergy(allergy.substance, med);
        if (!match) continue;
        const reaction = allergy.reaction ? `Documented reaction: ${allergy.reaction}.` : "No reaction details are documented.";
        const graded = allergySeverity(match.kind, allergy, asOf);
        findings.push(
          finding({
            type: "ALLERGY_CONFLICT",
            severity: graded.severity,
            title: `${med.generic} vs documented ${allergy.substance} allergy`,
            explanation: `${med.label} ${relationSentence(match)} ("${allergy.substance}", severity ${allergy.severity}). ${reaction} ${graded.basis} Whether this prescription can be dispensed depends on the nature of the prior reaction and the prescriber's intent; the system cannot determine that.`,
            origin: "allergy.cross-reactivity",
            medications: [med.generic],
            reviewQuestions: [
              `What was the nature and timing of the patient's reaction to ${allergy.substance} (rash, hives, anaphylaxis, GI upset, unknown)?`,
              "Has the patient tolerated this drug or a related drug since the reaction was recorded?",
              "Did the prescriber knowingly choose this drug despite the documented allergy?",
              match.kind === "CROSS_REACTIVE"
                ? "Does the side-chain similarity for this specific agent raise cross-reactivity concern?"
                : "Is an alternative agent from a different class appropriate?",
            ],
            referenceIds: match.rule.referenceIds,
            retrievalQuery: `${med.generic} ${allergy.substance} allergy contraindication hypersensitivity cross-reactivity`,
          }),
        );
      }
    }
    return findings;
  },
};
