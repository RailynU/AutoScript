import { SEVERITY_RANK } from "@autoscript/shared";
import { allergyRule } from "./rules/allergyRule";
import { entryVerificationRule } from "./rules/entryRule";
import { allergyHistoryRule, demographicsRule, noPatientRule } from "./rules/contextRules";
import { interactionRule } from "./rules/interactionRule";
import { lowConfidenceRule, missingFieldsRule, unresolvedDrugRule } from "./rules/prescriptionRules";
import { conditionRule, doseLimitRule, duplicateTherapyRule } from "./rules/therapyRules";
import type { Rule, RuleFinding, RuleInput, RuleResult } from "./types";

export const ALL_RULES: Rule[] = [
  interactionRule,
  allergyRule,
  noPatientRule,
  allergyHistoryRule,
  demographicsRule,
  missingFieldsRule,
  unresolvedDrugRule,
  lowConfidenceRule,
  duplicateTherapyRule,
  doseLimitRule,
  conditionRule,
  entryVerificationRule,
];

export const RULES_VERSION = "autoscript-rules-2026.10";

/** Run every deterministic rule and sort findings by severity. */
export function runRules(input: RuleInput, rules: Rule[] = ALL_RULES): RuleResult {
  const findings: RuleFinding[] = [];
  for (const rule of rules) findings.push(...rule.run(input));
  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const limitations = [
    "Interaction, allergy and condition checks cover only the curated demo tables (see COVERAGE.md); absence of a finding is not evidence of safety.",
  ];
  if (!input.patient) limitations.push("No patient record: allergy, interaction-with-current-medications, condition and age checks were not possible.");
  const unresolvedCount = input.extraction.medications.filter((m) => !m.normalizedName).length;
  if (unresolvedCount > 0) limitations.push(`${unresolvedCount} medication line(s) could not be normalized and were excluded from drug-specific checks.`);
  const undosed = input.extraction.medications.filter((m) => m.normalizedName && (!m.strength || (!m.frequency && !m.sig))).length;
  if (undosed > 0) limitations.push(`${undosed} medication line(s) lacked strength or frequency, so daily-dose checks were skipped for them.`);

  return { findings, rulesEvaluated: rules.map((r) => r.id), limitations };
}
