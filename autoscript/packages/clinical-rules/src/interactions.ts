import type { Severity } from "@autoscript/shared";
import type { DrugClass } from "./drugs";
import { BEERS_REFERENCE_ID, BEERS_SHORT_TERM_CLAUSE } from "./rules/therapyWording";

/** Lisinopril labeling, Section 7.3 (NSAIDs): the primary source for the ACE inhibitor + NSAID entry. */
export const LISINOPRIL_REFERENCE_ID = "fda-lisinopril-label-nsaids";

/**
 * Curated drug-drug interaction table. Each entry matches either a generic
 * name or a drug class on each side. This is a DEMO subset, not a complete
 * interaction database; see apps/rx-engine/references/COVERAGE.md.
 *
 * Severity is the table severity regardless of therapy context: a short course
 * still triggers the finding. Context only changes the explanation wording,
 * the monitoring guidance and which references are attached.
 */
export interface InteractionEntry {
  id: string;
  a: { generic?: string; class?: DrugClass };
  b: { generic?: string; class?: DrugClass };
  severity: Severity;
  title: string;
  mechanism: string;
  /** References that apply to any exposure, short course or ongoing. */
  referenceIds: string[];
  /** References whose statement is about long-term use only; attached when the context is CHRONIC or UNKNOWN, never for a short course. */
  longTermOnlyReferenceIds?: string[];
  /**
   * How the Beers 2023 entry behind this combination is named in the explanation of a short course that cites it.
   * Required whenever `referenceIds` includes the Beers document (a test enforces it); irrelevant otherwise.
   */
  beersClause?: string;
  /** What a short course still warrants (the finding keeps its table severity). */
  shortCourseGuidance: string;
  /** What ongoing therapy warrants beyond the short-course guidance. */
  ongoingGuidance: string;
  /** Age at or above which the cited references name age as a risk factor for this combination. */
  ageRiskThreshold?: number;
  reviewQuestions: string[];
}

const NSAID_AGE_THRESHOLD = 65;

export const INTERACTIONS: InteractionEntry[] = [
  {
    id: "warfarin-nsaid",
    a: { class: "ANTICOAGULANT_VKA" },
    b: { class: "NSAID" },
    severity: "HIGH",
    title: "Warfarin + NSAID: increased risk of serious bleeding",
    mechanism:
      "NSAIDs inhibit platelet function and can injure gastric mucosa; combined with vitamin K antagonist anticoagulation the risk of gastrointestinal and other serious bleeding rises. Some NSAIDs also displace warfarin from protein binding or alter its metabolism.",
    // Beers 2023 Table 2 applies to any duration here: its NSAID criterion says to avoid short-term scheduled use with anticoagulants.
    referenceIds: ["fda-warfarin-label-interactions", "fda-ibuprofen-label-anticoagulants", BEERS_REFERENCE_ID],
    beersClause: BEERS_SHORT_TERM_CLAUSE,
    shortCourseGuidance:
      "Even a course of a few days raises bleeding risk through platelet inhibition and gastric injury: confirm a recent INR, counsel on bleeding signs (melena, bruising, hematuria), consider acetaminophen within daily limits instead, and arrange INR follow-up if the NSAID is dispensed.",
    ongoingGuidance: "With ongoing use the bleeding risk is sustained: review whether the NSAID is necessary long-term, whether gastroprotection is in place, and how often the INR is checked.",
    ageRiskThreshold: NSAID_AGE_THRESHOLD,
    reviewQuestions: [
      "Is there a safer analgesic option (e.g., acetaminophen within daily limits) for this patient?",
      "Was the prescriber aware the patient is anticoagulated with warfarin?",
      "When was the last INR, and is closer INR monitoring planned if the NSAID is continued?",
      "Does the patient have additional bleeding risk factors (age > 65, prior GI bleed, concurrent antiplatelet)?",
    ],
  },
  {
    id: "warfarin-smx-tmp",
    a: { class: "ANTICOAGULANT_VKA" },
    b: { generic: "sulfamethoxazole-trimethoprim" },
    severity: "HIGH",
    title: "Warfarin + sulfamethoxazole-trimethoprim: INR elevation",
    mechanism:
      "Sulfamethoxazole inhibits CYP2C9 metabolism of S-warfarin and displaces warfarin from plasma proteins, producing a marked rise in INR within days.",
    referenceIds: ["fda-warfarin-label-interactions", "fda-smx-tmp-label-contraindications"],
    shortCourseGuidance: "The INR rise occurs within days, so a short antibiotic course still needs an INR check during the course and after it ends, or an alternative antibiotic.",
    ongoingGuidance: "Prolonged co-administration keeps the INR elevated; a warfarin dose adjustment with repeated INR checks is usually required.",
    reviewQuestions: [
      "Can an alternative antibiotic be used?",
      "If continued, is an INR check scheduled within 3-5 days and an empiric warfarin dose reduction considered?",
    ],
  },
  {
    id: "warfarin-fluconazole",
    a: { class: "ANTICOAGULANT_VKA" },
    b: { generic: "fluconazole" },
    severity: "HIGH",
    title: "Warfarin + fluconazole: INR elevation",
    mechanism: "Fluconazole is a potent CYP2C9 inhibitor and increases warfarin exposure.",
    referenceIds: ["fda-warfarin-label-interactions"],
    shortCourseGuidance: "Even a single-dose or short azole course can raise the INR within days; arrange an INR check during and after the course.",
    ongoingGuidance: "Prolonged azole therapy keeps warfarin exposure elevated; a dose adjustment with repeated INR checks is usually required.",
    reviewQuestions: ["Is INR monitoring arranged during and after the azole course?"],
  },
  {
    id: "warfarin-metronidazole",
    a: { class: "ANTICOAGULANT_VKA" },
    b: { generic: "metronidazole" },
    severity: "HIGH",
    title: "Warfarin + metronidazole: INR elevation",
    mechanism: "Metronidazole inhibits warfarin metabolism and potentiates its anticoagulant effect.",
    referenceIds: ["fda-warfarin-label-interactions"],
    shortCourseGuidance: "A typical 7-10 day course is long enough to raise the INR; arrange an INR check during the course.",
    ongoingGuidance: "Prolonged co-administration requires a warfarin dose adjustment with repeated INR checks.",
    reviewQuestions: ["Is INR monitoring arranged during the course?"],
  },
  {
    id: "ssri-nsaid",
    a: { class: "SSRI" },
    b: { class: "NSAID" },
    severity: "MODERATE",
    title: "SSRI + NSAID: increased gastrointestinal bleeding risk",
    mechanism:
      "SSRIs deplete platelet serotonin and impair aggregation; combined with NSAID-related mucosal injury the risk of upper GI bleeding is increased.",
    referenceIds: ["fda-ssri-label-bleeding"],
    longTermOnlyReferenceIds: ["beers-criteria-2023-nsaids"],
    shortCourseGuidance: "For a short course, counsel on GI bleeding signs and consider acetaminophen instead; gastroprotection is usually reserved for longer use.",
    ongoingGuidance: "With ongoing use, review the need for the NSAID, consider gastroprotection, and check for other bleeding risk factors.",
    ageRiskThreshold: NSAID_AGE_THRESHOLD,
    reviewQuestions: [
      "Is the NSAID intended for short-term use?",
      "Would gastroprotection or an alternative analgesic be appropriate?",
    ],
  },
  {
    id: "opioid-benzodiazepine",
    a: { class: "OPIOID" },
    b: { class: "BENZODIAZEPINE" },
    severity: "HIGH",
    title: "Opioid + benzodiazepine: profound sedation and respiratory depression (boxed warning)",
    mechanism: "Additive CNS and respiratory depression; FDA requires a boxed warning on both classes for concomitant use.",
    referenceIds: ["fda-opioid-benzodiazepine-boxed-warning"],
    shortCourseGuidance: "Respiratory depression risk is immediate and does not depend on duration: the boxed warning applies from the first co-administered dose; confirm necessity, lowest doses, counseling and naloxone availability.",
    ongoingGuidance: "Long-term co-prescription multiplies overdose risk; the boxed warning asks that combined use be limited to patients without adequate alternatives, at minimum doses and durations.",
    reviewQuestions: [
      "Is concomitant use clearly necessary and limited to the lowest dose and shortest duration?",
      "Has the patient been counseled on sedation and overdose risk, and is naloxone available?",
    ],
  },
  {
    id: "ace-inhibitor-nsaid",
    a: { class: "ACE_INHIBITOR" },
    b: { class: "NSAID" },
    severity: "MODERATE",
    title: "ACE inhibitor + NSAID: reduced antihypertensive effect and renal risk",
    mechanism: "NSAIDs blunt prostaglandin-mediated renal perfusion; combined with ACE inhibition this can precipitate acute kidney injury, especially with volume depletion or diuretics.",
    // Not a Beers 2023 item: Table 5 has no ACE inhibitor + NSAID row (checked 2026-10-24, eval/validation.ts). The labels are the source.
    referenceIds: [LISINOPRIL_REFERENCE_ID, "fda-ibuprofen-label-anticoagulants"],
    shortCourseGuidance:
      "Even a few days of NSAID can reduce renal perfusion in a patient on an ACE inhibitor, particularly at age 65 or older, with a diuretic, or when dehydrated: check that renal function is known and recent, advise hydration, and keep the course as short as possible.",
    ongoingGuidance: "With ongoing use the blood-pressure and renal effects are sustained: review the need for the NSAID and arrange renal function and blood pressure monitoring.",
    ageRiskThreshold: NSAID_AGE_THRESHOLD,
    reviewQuestions: ["Is the patient also on a diuretic (triple whammy)?", "Is renal function known and recent?"],
  },
  {
    id: "simvastatin-clarithromycin",
    a: { generic: "simvastatin" },
    b: { generic: "clarithromycin" },
    severity: "HIGH",
    title: "Simvastatin + clarithromycin: contraindicated (myopathy/rhabdomyolysis)",
    mechanism: "Clarithromycin strongly inhibits CYP3A4, raising simvastatin exposure many-fold.",
    referenceIds: ["fda-simvastatin-label-cyp3a4"],
    shortCourseGuidance: "The contraindication applies to any overlap, including a short antibiotic course; the usual options are holding the statin for the course or choosing a different antibiotic.",
    ongoingGuidance: "Prolonged co-administration is contraindicated; one of the two drugs must change.",
    reviewQuestions: ["Can the statin be held for the antibiotic course, or an alternative antibiotic chosen?"],
  },
];

export interface InteractionMatch {
  entry: InteractionEntry;
  drugA: string;
  drugB: string;
}

function sideMatches(
  side: { generic?: string; class?: DrugClass },
  generic: string,
  classes: DrugClass[],
): boolean {
  if (side.generic) return side.generic === generic;
  if (side.class) return classes.includes(side.class);
  return false;
}

/** Find interaction entries matching two normalized drugs, in either order. */
export function findInteractions(
  a: { generic: string; classes: DrugClass[] },
  b: { generic: string; classes: DrugClass[] },
): InteractionEntry[] {
  if (a.generic === b.generic) return [];
  return INTERACTIONS.filter(
    (entry) =>
      (sideMatches(entry.a, a.generic, a.classes) && sideMatches(entry.b, b.generic, b.classes)) ||
      (sideMatches(entry.a, b.generic, b.classes) && sideMatches(entry.b, a.generic, a.classes)),
  );
}
