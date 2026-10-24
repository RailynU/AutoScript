import type { TherapyContext } from "@autoscript/shared";
import type { TherapyContextResult } from "../therapyContext";

export const BEERS_REFERENCE_ID = "beers-criteria-2023-nsaids";
/**
 * Headings of the two clauses of the Beers 2023 oral NSAID criterion (Table 2). Both must match
 * apps/rx-engine/references/beers-criteria-2023-nsaids.md exactly; a pipeline test checks the ingested collection.
 */
export const BEERS_CHRONIC_USE_SECTION = "Non-COX-selective NSAIDs: avoid chronic use";
/** Second clause, new in 2023: short-term scheduled NSAID use with anticoagulants, antiplatelets or corticosteroids. */
export const BEERS_SHORT_TERM_COMBINATION_SECTION = "Non-COX-selective NSAIDs: avoid short-term scheduled use with anticoagulants, antiplatelets or corticosteroids";
/** Plain-language name of the short-term clause, used in explanations that cite it. */
export const BEERS_SHORT_TERM_CLAUSE = "criterion on short-term scheduled NSAID use with anticoagulants, antiplatelets or corticosteroids";

/**
 * Sections never attached as evidence to a finding about a short course, whichever documents the rule cites:
 * the Beers chronic-use clause is about long-term exposure. The short-term clause of the same criterion is not
 * excluded; whether it is cited is decided per rule entry (interactions.ts referenceIds vs longTermOnlyReferenceIds).
 */
export function excludedSectionsFor(context: TherapyContext): string[] {
  return context === "ACUTE_SHORT_COURSE" ? [`${BEERS_REFERENCE_ID}::${BEERS_CHRONIC_USE_SECTION}`] : [];
}

/**
 * Wording rules: a short-course sentence never uses the word "chronic" (so a reader, or a test,
 * can tell at a glance that the course was not described as long-term exposure).
 */
export function therapyContextSentence(ctx: TherapyContextResult): string {
  switch (ctx.context) {
    case "ACUTE_SHORT_COURSE":
      return `Therapy context: short course (${ctx.basis}); this finding describes the overlap during the course, not long-term exposure.`;
    case "CHRONIC":
      return `Therapy context: ongoing (chronic) therapy (${ctx.basis}).`;
    case "UNKNOWN":
      return `Therapy context: could not be determined from the prescription (${ctx.basis}); duration-dependent risks are described without assuming long-term use.`;
    default:
      return assertUnreachable(ctx.context);
  }
}

/**
 * Sentence about the AGS Beers 2023 NSAID reference for a short course. `cited` says whether the
 * finding still attaches it (for a duration-independent entry of that document) or omitted it.
 */
export function beersShortCourseNote(context: TherapyContext, cited: boolean, entryDescription: string): string | null {
  if (context !== "ACUTE_SHORT_COURSE") return null;
  return cited
    ? `The AGS Beers 2023 reference is cited for its ${entryDescription}, which is not limited to long-term use; its clause about long-term NSAID use does not apply to this short course.`
    : "The AGS Beers 2023 NSAID clause that would apply here addresses long-term use and is not cited for this short course.";
}

export function joinSentences(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" ");
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled therapy context: ${String(value)}`);
}
