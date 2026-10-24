import { patientAgeYears, prescriptionDate } from "../age";
import { findInteractions, type InteractionEntry } from "../interactions";
import type { TherapyContextResult } from "../therapyContext";
import type { Rule, RuleFinding } from "../types";
import { describe, finding, resolvePatientMeds, resolvePrescribed, therapyContextFor, type ResolvedMed } from "./helpers";
import { BEERS_REFERENCE_ID, beersShortCourseNote, excludedSectionsFor, joinSentences, therapyContextSentence } from "./therapyWording";

function guidanceFor(entry: InteractionEntry, ctx: TherapyContextResult): string {
  switch (ctx.context) {
    case "ACUTE_SHORT_COURSE":
      return `For this short course: ${entry.shortCourseGuidance}`;
    case "CHRONIC":
      return `${entry.ongoingGuidance} ${entry.shortCourseGuidance}`;
    case "UNKNOWN":
      return `Clarify the intended duration with the prescriber. ${entry.shortCourseGuidance} ${entry.ongoingGuidance}`;
  }
}

function ageNote(entry: InteractionEntry, age: number | null): string | null {
  if (entry.ageRiskThreshold == null || age == null || age < entry.ageRiskThreshold) return null;
  return `Patient age ${age} (${entry.ageRiskThreshold} or older) is named in the cited references as a risk factor for this combination.`;
}

function referenceIdsFor(entry: InteractionEntry, ctx: TherapyContextResult): string[] {
  const longTerm = ctx.context === "ACUTE_SHORT_COURSE" ? [] : (entry.longTermOnlyReferenceIds ?? []);
  return [...entry.referenceIds, ...longTerm];
}

function beersNote(entry: InteractionEntry, ctx: TherapyContextResult, cited: string[]): string | null {
  const mentionsBeers = entry.referenceIds.includes(BEERS_REFERENCE_ID) || (entry.longTermOnlyReferenceIds ?? []).includes(BEERS_REFERENCE_ID);
  if (!mentionsBeers) return null;
  return beersShortCourseNote(ctx.context, cited.includes(BEERS_REFERENCE_ID), entry.beersClause ?? "entry for this combination");
}

export const interactionRule: Rule = {
  id: "interaction.pairwise",
  description: "Pairwise check of prescribed drugs against each other and against active patient medications, using the curated interaction table.",
  run({ extraction, patient }) {
    const { resolved } = resolvePrescribed(extraction.medications);
    const patientMeds = patient ? resolvePatientMeds(patient.medications) : [];
    const pool: ResolvedMed[] = [...resolved, ...patientMeds];
    const age = patientAgeYears(patient, prescriptionDate(extraction.dateWritten));
    const findings: RuleFinding[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i]!;
        const b = pool[j]!;
        // At least one side must come from the new prescription.
        if (a.source === "PATIENT_RECORD" && b.source === "PATIENT_RECORD") continue;
        for (const entry of findInteractions(a, b)) {
          const key = `${entry.id}:${[a.generic, b.generic].sort().join("+")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const ctx = therapyContextFor([a, b]);
          const referenceIds = referenceIdsFor(entry, ctx);
          findings.push(
            finding({
              type: "DRUG_INTERACTION",
              severity: entry.severity,
              title: entry.title,
              // The clinical mechanism leads (it is the one sentence a card shows unfolded); the rule match comes last.
              explanation: joinSentences([
                entry.mechanism,
                therapyContextSentence(ctx),
                guidanceFor(entry, ctx),
                ageNote(entry, age),
                beersNote(entry, ctx, referenceIds),
                `Matched: ${describe(a)} and ${describe(b)} (curated interaction rule "${entry.id}").`,
              ]),
              origin: `interaction.pairwise/${entry.id}`,
              medications: [a.generic, b.generic],
              reviewQuestions: entry.reviewQuestions,
              referenceIds,
              excludedSections: excludedSectionsFor(ctx.context),
              retrievalQuery: `${a.generic} ${b.generic} interaction bleeding risk monitoring`,
              therapyContext: ctx,
            }),
          );
        }
      }
    }
    return findings;
  },
};
