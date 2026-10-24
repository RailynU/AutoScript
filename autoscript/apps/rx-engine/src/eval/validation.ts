/**
 * Where each curated eval label comes from. Every expected finding in cases.ts was written by the authors; this file
 * records the public source that was opened on ACCESSED_ON to check it, and says honestly where the source does not
 * back the label. Human-readable version: datasets/eval/validation.md.
 *
 * Rules of this file: one source entry per document actually opened (a URL that bounced to a bot-check or 404 is not
 * cited; the note says so); at most one quote of 15 words or fewer per source; severity comparisons are stated, never
 * used to adjust the case.
 */

export const ACCESSED_ON = "2026-10-24" as const;

export const VALIDATION_STATUSES = ["CONFIRMED", "PARTIAL", "DISPUTED", "NOT_FOUND"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** Longest quote allowed per source (words), enforced by a test. */
export const MAX_QUOTE_WORDS = 15;

export interface ValidationSource {
  title: string;
  publisher: string;
  /** The URL that was opened. For fda.gov pages that answer 404 to non-browser clients, this is the Internet Archive copy. */
  url: string;
  section: string;
  accessed: typeof ACCESSED_ON;
  quote?: string;
}

export interface CaseValidation {
  status: ValidationStatus;
  /** The clinical or regulatory claim behind the expected label. */
  claim: string;
  sources: ValidationSource[];
  /** What the sources do and do not support, including any severity gap, in plain words. */
  note: string;
}

/** Ids of the curated cases. cases.ts types each case id with this union, so a new case must be listed here and in CASE_VALIDATION before it typechecks. */
export const CURATED_CASE_IDS = [
  "cur-warfarin-ibuprofen",
  "cur-penicillin-amoxicillin",
  "cur-lisinopril-ibuprofen",
  "cur-no-patient",
  "cur-allergy-unverified",
  "cur-allergy-no-entries",
  "cur-no-flags",
  "cur-unrecognized-drug",
  "cur-handwritten-noisy",
  "cur-nsaid-short-course",
  "cur-nsaid-chronic",
] as const;
export type CuratedCaseId = (typeof CURATED_CASE_IDS)[number];

// ---- Sources (one constant per opened document) ------------------------------------------------------------------

const DAILYMED = "DailyMed, U.S. National Library of Medicine (FDA-approved labeling)";
const dailyMed = (setid: string): string => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;

const WARFARIN_5_1: ValidationSource = {
  title: "Warfarin Sodium Tablets prescribing information (Teva, label effective 2025-06-17)",
  publisher: DAILYMED,
  url: dailyMed("0cbce382-9c88-4f58-ae0f-532a841e8f95"),
  section: "5.1 Hemorrhage",
  accessed: ACCESSED_ON,
  quote: "Risk factors for bleeding include ... age greater than or equal to 65",
};

const WARFARIN_7_3: ValidationSource = {
  title: "Warfarin Sodium Tablets prescribing information (Teva, label effective 2025-06-17)",
  publisher: DAILYMED,
  url: dailyMed("0cbce382-9c88-4f58-ae0f-532a841e8f95"),
  section: "7.3 Drugs that Increase Bleeding Risk, Table 3 (Non-steroidal Anti-Inflammatory Agents: ibuprofen, naproxen listed)",
  accessed: ACCESSED_ON,
  quote: "closely monitor patients receiving any such drug with warfarin",
};

const IBUPROFEN_RX: ValidationSource = {
  title: "Ibuprofen Tablets (Rx) prescribing information (Granules India, label effective 2026-10-07)",
  publisher: DAILYMED,
  url: dailyMed("8804564c-9e1b-43c1-8b58-fd6ace645f00"),
  section: "Precautions, Drug Interactions: Warfarin-type anticoagulants",
  accessed: ACCESSED_ON,
  quote: "bleeding has been reported when ibuprofen tablets and other NSAIDs have been administered",
};

const MOTRIN_IB: ValidationSource = {
  title: "Motrin IB (ibuprofen) Drug Facts label (label effective 2026-01-01)",
  publisher: DAILYMED,
  url: dailyMed("56846774-8413-c306-e063-6394a90a2be8"),
  section: "Active ingredient (ibuprofen 200 mg); Stomach bleeding warning",
  accessed: ACCESSED_ON,
  quote: "take a blood thinning (anticoagulant) or steroid drug",
};

const NAPROXEN_HEMOSTASIS: ValidationSource = {
  title: "Naproxen Tablets prescribing information (Granules, label effective 2026-10-08)",
  publisher: DAILYMED,
  url: dailyMed("c1cb9bb9-fbae-5e5c-e053-2995a90a0d21"),
  section: "7 Drug Interactions, Table 1: Drugs That Interfere with Hemostasis",
  accessed: ACCESSED_ON,
  quote: "Naproxen and anticoagulants such as warfarin have a synergistic effect on bleeding.",
};

const LISINOPRIL_7_3: ValidationSource = {
  title: "Lisinopril Tablets prescribing information (Bluepoint Laboratories, label effective 2026-10-07)",
  publisher: DAILYMED,
  url: dailyMed("34ebeea1-6812-4697-84c4-b2ae4f39e55f"),
  section: "7.3 Non-Steroidal Anti-Inflammatory Agents Including Selective COX-2 Inhibitors",
  accessed: ACCESSED_ON,
  quote: "may result in deterioration of renal function, including possible acute renal failure",
};

const NAPROXEN_ACEI: ValidationSource = {
  title: "Naproxen Tablets prescribing information (Granules, label effective 2026-10-08)",
  publisher: DAILYMED,
  url: dailyMed("c1cb9bb9-fbae-5e5c-e053-2995a90a0d21"),
  section: "7 Drug Interactions, Table 1: ACE Inhibitors and ARBs (highlights: diminished antihypertensive effect)",
  accessed: ACCESSED_ON,
};

const AMOXICILLIN_4: ValidationSource = {
  title: "Amoxicillin Capsules prescribing information (Hikma, label effective 2026-03-01)",
  publisher: DAILYMED,
  url: dailyMed("4fb7837e-964c-4d38-a3a5-b384b1bd6e08"),
  section: "4 Contraindications",
  accessed: ACCESSED_ON,
  quote: "serious hypersensitivity reaction (e.g., anaphylaxis or Stevens-Johnson syndrome)",
};

const AMOXICILLIN_5_1: ValidationSource = {
  title: "Amoxicillin Capsules prescribing information (Hikma, label effective 2026-03-01)",
  publisher: DAILYMED,
  url: dailyMed("4fb7837e-964c-4d38-a3a5-b384b1bd6e08"),
  section: "5.1 Anaphylactic Reactions",
  accessed: ACCESSED_ON,
  quote: "careful inquiry should be made regarding previous hypersensitivity reactions to penicillins",
};

const AAAAI_2022_STATEMENT_9: ValidationSource = {
  title: "Drug allergy: A 2022 practice parameter update (Khan DA et al., J Allergy Clin Immunol 2022;150:1333-93), AAAAI-hosted pre-proof PDF",
  publisher: "AAAAI/ACAAI Joint Task Force on Practice Parameters",
  url: "https://www.aaaai.org/Aaaai/media/Media-Library-PDFs/Allergist%20Resources/Statements%20and%20Practice%20Parameters/Drug-Allergy-PP-9-2022.pdf",
  section: "Consensus Based Statement 9 (direct amoxicillin challenge in adults with low-risk histories)",
  accessed: ACCESSED_ON,
  quote: "adults with a history of distant (i.e., > 5 years ago) and benign cutaneous reactions",
};

const BEERS_PMC = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/";
const BEERS_TITLE = "American Geriatrics Society 2023 updated AGS Beers Criteria for potentially inappropriate medication use in older adults (J Am Geriatr Soc 2023;71:2052-2081)";
const BEERS_PUBLISHER = "American Geriatrics Society; full text read on PubMed Central (PMC12478568)";

const BEERS_TABLE_2_CHRONIC: ValidationSource = {
  title: BEERS_TITLE,
  publisher: BEERS_PUBLISHER,
  url: BEERS_PMC,
  section: "Table 2, Non-COX-selective NSAIDs, oral: first recommendation",
  accessed: ACCESSED_ON,
  quote: "Avoid chronic use unless other alternatives are not effective",
};

const BEERS_TABLE_2_SHORT_TERM: ValidationSource = {
  title: BEERS_TITLE,
  publisher: BEERS_PUBLISHER,
  url: BEERS_PMC,
  section: "Table 2, Non-COX-selective NSAIDs, oral: second recommendation (new in 2023)",
  accessed: ACCESSED_ON,
  quote: "Avoid short-term scheduled use in combination with oral or parenteral corticosteroids, anticoagulants, or antiplatelet agents",
};

const BEERS_TABLE_5: ValidationSource = {
  title: BEERS_TITLE,
  publisher: BEERS_PUBLISHER,
  url: BEERS_PMC,
  section: "Table 5, drug-drug interactions (rows: RAS inhibitors; Opioids + Benzodiazepines; Warfarin + amiodarone/ciprofloxacin/macrolides/SMX-TMP/SSRIs)",
  accessed: ACCESSED_ON,
  quote: "Opioids Benzodiazepines Increased risk of overdose and adverse events. Avoid",
};

const BEERS_TABLE_8: ValidationSource = {
  title: BEERS_TITLE,
  publisher: BEERS_PUBLISHER,
  url: BEERS_PMC,
  section: "Table 8, Medications/criteria removed since 2019 (drug-drug interactions)",
  accessed: ACCESSED_ON,
  quote: "Warfarin + NSAIDs Incorporated into oral NSAID criterion in Table 2",
};

const ECFR_1306_05: ValidationSource = {
  title: "21 CFR 1306.05 Manner of issuance of prescriptions (eCFR, text current as of 2026-10-01, read through the eCFR versioner API)",
  publisher: "Office of the Federal Register / U.S. Drug Enforcement Administration",
  url: "https://www.ecfr.gov/current/title-21/chapter-II/part-1306/section-1306.05",
  section: "(a) required elements; (f) corresponding liability of the pharmacist",
  accessed: ACCESSED_ON,
  quote: "the full name and address of the patient, the drug name, strength, dosage form",
};

const TJC_NPSG_03_06_01: ValidationSource = {
  title: "National Patient Safety Goals effective January 2026, Ambulatory Health Care Program (NPSG chapter PDF)",
  publisher: "The Joint Commission",
  url: "https://digitalassets.jointcommission.org/api/public/content/92c95c4e94304b2084e7e039d916719b",
  section: "NPSG.03.06.01 Maintain and communicate accurate patient medication information: Rationale and EP 1",
  accessed: ACCESSED_ON,
  quote: "Obtain and/or update information on the medications the patient is currently taking.",
};

const CETIRIZINE_OTC: ValidationSource = {
  title: "Cetirizine Hydrochloride Tablets 10 mg Drug Facts label (Dr. Reddy's, label effective 2025-07-17)",
  publisher: DAILYMED,
  url: dailyMed("206ab55a-3720-6205-d710-6e7953571418"),
  section: "Warnings: Do not use; Ask a doctor or pharmacist before use",
  accessed: ACCESSED_ON,
  quote: "Do not use if you have ever had an allergic reaction to this product",
};

const DAILYMED_SEARCH_ZELMORAVIX: ValidationSource = {
  title: "DailyMed label search for \"zelmoravix\" (0 labels; the SPL web service drug_name query also returns total_elements 0)",
  publisher: DAILYMED,
  url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=zelmoravix",
  section: "Search results",
  accessed: ACCESSED_ON,
};

const FDA_DSC_OPIOID_BZD: ValidationSource = {
  title: "FDA Drug Safety Communication (2016-08-31): FDA warns about serious risks and death when combining opioid pain or cough medicines with benzodiazepines; requires its strongest warning (Internet Archive copy of 2026-01-13; fda.gov answers 404 to non-browser clients)",
  publisher: "U.S. Food and Drug Administration",
  url: "https://web.archive.org/web/20260113014821/https://www.fda.gov/drugs/drug-safety-and-availability/fda-drug-safety-communication-fda-warns-about-serious-risks-and-death-when-combining-opioid-pain-or",
  section: "Announcement and Recommendations for health care professionals",
  accessed: ACCESSED_ON,
  quote: "we are adding Boxed Warnings, our strongest warnings, to the drug labeling",
};

const OXYCODONE_BOXED: ValidationSource = {
  title: "Oxycodone Hydrochloride Tablets prescribing information (SpecGx, label effective 2026-08-07)",
  publisher: DAILYMED,
  url: dailyMed("928227bf-89c5-4c64-9823-0e84cc669388"),
  section: "Boxed Warning: Risks from Concomitant Use with Benzodiazepines or Other CNS Depressants",
  accessed: ACCESSED_ON,
  quote: "may result in profound sedation, respiratory depression, coma, and death",
};

const ZOCOR_4_AND_7_1: ValidationSource = {
  title: "Zocor (simvastatin) prescribing information (Organon, label effective 2025-03-28)",
  publisher: DAILYMED,
  url: dailyMed("8f55d5de-5a4f-4a39-8c84-c53976dd6af9"),
  section: "4 Contraindications; 7.1 Strong CYP3A4 inhibitors (erythromycin and clarithromycin named)",
  accessed: ACCESSED_ON,
  quote: "select macrolide antibiotics (e.g., erythromycin and clarithromycin)",
};

const FDA_DSC_SIMVASTATIN: ValidationSource = {
  title: "FDA Drug Safety Communication (2011-06-08): New restrictions, contraindications, and dose limitations for Zocor (simvastatin) to reduce the risk of muscle injury (Internet Archive copy of 2025-12-14; fda.gov answers 404 to non-browser clients)",
  publisher: "U.S. Food and Drug Administration",
  url: "https://web.archive.org/web/20251214090553/https://www.fda.gov/drugs/drug-safety-and-availability/fda-drug-safety-communication-new-restrictions-contraindications-and-dose-limitations-zocor",
  section: "Table: Previous simvastatin label / New simvastatin label, \"Contraindicated with simvastatin\"",
  accessed: ACCESSED_ON,
  quote: "Contraindicated with simvastatin: Itraconazole Ketoconazole Posaconazole (New) Erythromycin Clarithromycin",
};

// ---- Shared notes ---------------------------------------------------------------------------------------------------

const WARFARIN_NSAID_CLAIM = "Warfarin + NSAID raises the risk of serious bleeding; severity HIGH; route to manual review.";

/** Date the three label-source corrections below were applied (Beers short-term clause, Beers paraphrase, allergy grading). */
export const CORRECTED_ON = "2026-10-24" as const;

const BEERS_SHORT_COURSE_GAP =
  `Corrected in place on ${CORRECTED_ON}. Earlier the same day this entry read: the case bans the Beers 2023 "avoid chronic use" section and the reference paraphrase says the criterion is not a statement about a short course, which Beers 2023 Table 2 contradicts (second clause: avoid short-term scheduled NSAID use with anticoagulants; patient is 74 and takes warfarin). That sentence was removed from the paraphrase, the second clause is now its own section, and the warfarin + NSAID entry cites it at any duration; the case requires that section and still bans the chronic-use one. Residual gap: the ibuprofen here is PRN, which falls outside the letter of "scheduled", and the rule does not distinguish PRN from scheduled dosing, so the citation is one step broader than the source; the reference text says so.`;

// ---- Per-case validation ---------------------------------------------------------------------------------------------

export const CASE_VALIDATION = {
  "cur-warfarin-ibuprofen": {
    status: "PARTIAL",
    claim: WARFARIN_NSAID_CLAIM,
    sources: [WARFARIN_7_3, WARFARIN_5_1, IBUPROFEN_RX, BEERS_TABLE_2_SHORT_TERM],
    note:
      "Finding confirmed: the warfarin label lists ibuprofen among drugs that increase bleeding risk and names age >= 65 as a bleeding risk factor; the ibuprofen label reports bleeding on coumarin anticoagulants. Labels do not grade severity; Beers 2023 rates NSAID + anticoagulant \"Avoid\" (strong), consistent with HIGH. " +
      BEERS_SHORT_COURSE_GAP,
  },
  "cur-penicillin-amoxicillin": {
    status: "CONFIRMED",
    claim: "A documented penicillin allergy (hives, 2009, recorded MODERATE) makes amoxicillin a flagged, review-needed prescription; severity MODERATE for a documented non-severe reaction recorded more than 5 years earlier.",
    sources: [AMOXICILLIN_5_1, AMOXICILLIN_4, AAAAI_2022_STATEMENT_9],
    note:
      `Flagging for review is supported: the label requires careful inquiry about prior penicillin hypersensitivity. Corrected in place on ${CORRECTED_ON}: until then the rule graded every non-SEVERE direct match HIGH, which was higher than the sources imply (the Section 4 contraindication covers serious reactions such as anaphylaxis or SJS; the 2022 practice parameter classes a distant, more than 5 years, benign cutaneous reaction as low risk). allergyRule.ts allergySeverity() now grades MODERATE when the record says MILD or MODERATE, describes the reaction and is dated 5 or more years before the prescription; UNKNOWN, undescribed, undated or recent reactions stay HIGH and SEVERE stays CRITICAL. Boundary of the correction: "benign" is inferred from the record's grade plus the presence of a description, not from reading the reaction text, and the finding says the nature must be confirmed. CDC's penicillin-allergy page could not be opened (403) and is not cited.`,
  },
  "cur-lisinopril-ibuprofen": {
    status: "CONFIRMED",
    claim: "ACE inhibitor + NSAID reduces the antihypertensive effect and risks acute kidney injury; severity MODERATE; evidence is the lisinopril label Section 7.3, and no Beers section is required.",
    sources: [LISINOPRIL_7_3, NAPROXEN_ACEI, BEERS_TABLE_5, BEERS_TABLE_2_SHORT_TERM],
    note:
      `Interaction confirmed by the lisinopril label (renal deterioration, attenuated antihypertensive effect, "monitor renal function periodically"); MODERATE is consistent with a monitor-level label statement. Corrected in place on ${CORRECTED_ON}: until then the case required the Beers "Drug-drug interactions table" section, but Beers 2023 Table 5 has no ACE-inhibitor + NSAID row and the full text contains no "triple whammy" sentence (0 matches); that sentence was removed from the Beers paraphrase, the rule now cites a new reference file for lisinopril Section 7.3 (fda-lisinopril-label-nsaids) plus the ibuprofen label, and the case requires that lisinopril section. The chronic-use section stays banned: the 2023 short-term clause names corticosteroids, anticoagulants and antiplatelets, not ACE inhibitors.`,
  },
  "cur-no-patient": {
    status: "CONFIRMED",
    claim: "A prescription with no linked patient record cannot be checked for allergies or interactions and needs manual review.",
    sources: [TJC_NPSG_03_06_01, ECFR_1306_05],
    note:
      "NPSG.03.06.01 EP 1 requires obtaining the patient's current medication information and its rationale says reconciliation \"addresses duplications, omissions, and interactions\", which is exactly what cannot be done without a record. 21 CFR 1306.05(a) requires the patient's full name and address on controlled-substance prescriptions only; cetirizine is not controlled, so that citation is by analogy. No source grades the HIGH severity; it is system policy.",
  },
  "cur-allergy-unverified": {
    status: "PARTIAL",
    claim: "Allergy entries never verified with the patient leave allergy screening incomplete; severity MODERATE.",
    sources: [TJC_NPSG_03_06_01],
    note:
      "The medication-reconciliation goal supports obtaining and updating patient information, but the 2026 NPSG chapter text does not mention allergies. The ISMP allergy-documentation guidance the reference file cites could not be located as a specific ISMP (US) publication; searches found an ISMP Canada 2015 community-pharmacy bulletin naming missing documentation as a theme, which was not opened and is not cited. No source grades MODERATE.",
  },
  "cur-allergy-no-entries": {
    status: "PARTIAL",
    claim: "A profile with no allergy entry at all (not even NKDA) leaves allergy screening incomplete; severity MODERATE.",
    sources: [TJC_NPSG_03_06_01],
    note:
      "Same evidence and the same gap as cur-allergy-unverified: the opened standard covers medication information, not an explicit NKDA-recording requirement. The specific claim that \"no known drug allergies\" must be recorded explicitly was not found in an opened primary source.",
  },
  "cur-no-flags": {
    status: "CONFIRMED",
    claim: "Cetirizine for a verified-NKDA adult on no other medication produces no finding from the curated rules.",
    sources: [CETIRIZINE_OTC],
    note:
      "A negative can only be checked against the label and the profile: the cetirizine Drug Facts label's only \"Do not use\" is prior allergic reaction to cetirizine or hydroxyzine, and its \"ask a doctor\" items (liver or kidney disease, sedatives, tranquilizers) do not apply to this profile (NKDA, seasonal allergic rhinitis, no medications). This confirms the absence of a label-based flag, not that the prescription is safe.",
  },
  "cur-unrecognized-drug": {
    status: "CONFIRMED",
    claim: "\"Zelmoravix\" is not a recognizable US drug name, so the line cannot be checked and the prescription needs review.",
    sources: [DAILYMED_SEARCH_ZELMORAVIX],
    note:
      "The factual claim is confirmed: DailyMed holds no label for the name (0 results on 2026-10-24). The requirement to route an unresolved name to manual review is the system's coverage policy (autoscript-coverage-limitations), not a clinical guideline; no source grades MODERATE.",
  },
  "cur-handwritten-noisy": {
    status: "PARTIAL",
    claim: "Motrin is ibuprofen; " + WARFARIN_NSAID_CLAIM,
    sources: [MOTRIN_IB, WARFARIN_7_3, IBUPROFEN_RX, BEERS_TABLE_2_SHORT_TERM],
    note:
      "Motrin IB's Drug Facts label lists ibuprofen as the active ingredient and warns about anticoagulant use, and the warfarin label lists ibuprofen among bleeding-risk drugs, so the finding is confirmed. " +
      BEERS_SHORT_COURSE_GAP,
  },
  "cur-nsaid-short-course": {
    status: "CONFIRMED",
    claim: "A scheduled 5-day naproxen course for a 74-year-old on warfarin is a HIGH bleeding-risk interaction; the Beers 2023 short-term clause (scheduled NSAID use with anticoagulants) must be attached and the chronic-use clause must not.",
    sources: [NAPROXEN_HEMOSTASIS, WARFARIN_7_3, BEERS_TABLE_2_SHORT_TERM, BEERS_TABLE_8],
    note:
      `The interaction and its HIGH severity are confirmed (naproxen label: synergistic effect on bleeding; warfarin label lists naproxen). Corrected in place on ${CORRECTED_ON}: until then this case was DISPUTED because it required that no Beers NSAID section be attached, while Beers 2023 Table 2 says to avoid short-term scheduled NSAID use with anticoagulants and Table 8 records that the former warfarin + NSAID row was folded into that criterion. Naproxen twice daily for 5 days is scheduled use. The paraphrase now carries the second clause as its own section, the warfarin + NSAID entry cites the document at any duration, and the case requires that section while still banning the chronic-use one and the word "chronic" in finding text.`,
  },
  "cur-nsaid-chronic": {
    status: "CONFIRMED",
    claim: "Ongoing naproxen with refills for a 74-year-old on warfarin is a HIGH bleeding-risk interaction and matches the Beers 2023 NSAID chronic-use criterion.",
    sources: [BEERS_TABLE_2_CHRONIC, NAPROXEN_HEMOSTASIS, WARFARIN_7_3, BEERS_TABLE_8],
    note:
      `Beers 2023 Table 2 says to avoid chronic NSAID use in adults 65 and older and names anticoagulant users among the high-risk groups (recommendation Avoid, quality Moderate, strength Strong), consistent with HIGH. A wording gap in the reference file was corrected on ${CORRECTED_ON}: its "Drug-drug interactions table" section listed warfarin + NSAIDs, which Beers 2023 removed from Table 5 (Table 8) in favour of the Table 2 criterion this case requires; the section now says so.`,
  },
} satisfies Record<CuratedCaseId, CaseValidation>;

/** Validation for a case id, or null for generated cases. */
export function validationFor(caseId: string): CaseValidation | null {
  return (CURATED_CASE_IDS as readonly string[]).includes(caseId) ? CASE_VALIDATION[caseId as CuratedCaseId] : null;
}

// ---- Rule-level checks (table entries the curated cases do not exercise) --------------------------------------------

export const RULE_LEVEL_CHECK_IDS = ["beers-nsaid-criterion-scope", "opioid-benzodiazepine-boxed-warning", "simvastatin-clarithromycin-contraindicated"] as const;
export type RuleLevelCheckId = (typeof RULE_LEVEL_CHECK_IDS)[number];

export const RULE_LEVEL_VALIDATION = {
  "beers-nsaid-criterion-scope": {
    status: "CONFIRMED",
    claim: "The AGS 2023 Beers oral NSAID criterion has two clauses: chronic use (excluded from every short-course finding, therapyWording.ts excludedSectionsFor) and short-term scheduled use with anticoagulants, antiplatelets or corticosteroids (cited by the warfarin + NSAID entry at any duration, interactions.ts; SSRI + NSAID keeps Beers for ongoing therapy only).",
    sources: [BEERS_TABLE_2_CHRONIC, BEERS_TABLE_2_SHORT_TERM, BEERS_TABLE_8],
    note:
      `Corrected in place on ${CORRECTED_ON}: until then the rules treated the criterion as chronic-use only and excluded the whole document from every short course, which contradicted the second clause for warfarin + NSAID at age 65 or older. Boundaries of the correction: the rule does not distinguish PRN from scheduled dosing (one step broader than "scheduled"); no antiplatelet or corticosteroid + NSAID interaction entry exists in the table, so only the warfarin path exercises the clause; and the Beers citation is not gated on age 65 or older for any entry (pre-existing, recorded as a follow-up).`,
  },
  "opioid-benzodiazepine-boxed-warning": {
    status: "CONFIRMED",
    claim: "FDA requires a boxed warning on opioid analgesics and benzodiazepines for concomitant use (profound sedation, respiratory depression, coma, death); severity HIGH.",
    sources: [FDA_DSC_OPIOID_BZD, OXYCODONE_BOXED, BEERS_TABLE_5],
    note: "Stated as in interactions.ts: the 2016 communication adds boxed warnings to both classes and asks prescribers to limit co-prescribing to patients without adequate alternatives; a current oxycodone label carries the boxed warning; Beers 2023 Table 5 says Avoid.",
  },
  "simvastatin-clarithromycin-contraindicated": {
    status: "CONFIRMED",
    claim: "Simvastatin is contraindicated with clarithromycin (strong CYP3A4 inhibitor; myopathy/rhabdomyolysis); severity HIGH.",
    sources: [ZOCOR_4_AND_7_1, FDA_DSC_SIMVASTATIN],
    note: "Stated as in interactions.ts: Zocor Section 4 contraindicates strong CYP3A4 inhibitors including macrolide antibiotics and 7.1 names clarithromycin; the 2011 communication lists clarithromycin under \"Contraindicated with simvastatin\".",
  },
} satisfies Record<RuleLevelCheckId, CaseValidation>;
