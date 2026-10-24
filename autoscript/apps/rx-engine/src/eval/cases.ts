import { BEERS_CHRONIC_USE_SECTION, BEERS_REFERENCE_ID, BEERS_SHORT_TERM_COMBINATION_SECTION, LISINOPRIL_REFERENCE_ID } from "@autoscript/clinical-rules";
import { findScenario, type PatientContext } from "@autoscript/shared";
import type { GroundTruth } from "../dataset/us/schema.js";
import { LlmExtractionSchema, type LlmExtraction } from "../extraction/extract.js";
import { ALL_RULE_FAMILIES, allFamiliesExcept } from "./families.js";
import type { EvalCaseSpec, EvalExpectation, EvidenceSectionRef } from "./types.js";
import { CASE_VALIDATION, type CaseValidation, type CuratedCaseId } from "./validation.js";

/**
 * The scenarios the curated list must cover. A test asserts that every member appears in CURATED_CASES,
 * so adding a scenario here without a case fails the suite.
 */
export const REQUIRED_SCENARIOS = [
  "WARFARIN_NSAID",
  "PENICILLIN_AMOXICILLIN",
  "ACE_INHIBITOR_NSAID",
  "NO_PATIENT",
  "ALLERGY_HISTORY",
  "NO_FLAGS",
  "UNRECOGNIZED_DRUG",
  "AMBIGUOUS_EXTRACTION",
  "NSAID_SHORT_COURSE",
  "NSAID_CHRONIC",
] as const;
export type RequiredScenario = (typeof REQUIRED_SCENARIOS)[number];

/** A curated case: its id is one of CURATED_CASE_IDS and it carries the public-source validation of its labels (validation.ts). */
export interface CuratedCaseSpec extends EvalCaseSpec {
  id: CuratedCaseId;
  validation: CaseValidation;
}

const BEERS_CHRONIC: EvidenceSectionRef = { documentId: BEERS_REFERENCE_ID, section: BEERS_CHRONIC_USE_SECTION };
/** Beers 2023 Table 2, second clause: short-term scheduled NSAID use with anticoagulants, antiplatelets or corticosteroids. */
const BEERS_SHORT_TERM: EvidenceSectionRef = { documentId: BEERS_REFERENCE_ID, section: BEERS_SHORT_TERM_COMBINATION_SECTION };
/** Lisinopril labeling 7.3 (heading as written in apps/rx-engine/references/fda-lisinopril-label-nsaids.md). */
const LISINOPRIL_7_3: EvidenceSectionRef = { documentId: LISINOPRIL_REFERENCE_ID, section: "Section 7.3 Non-steroidal anti-inflammatory agents" };
/** Text of the limitation runRules always emits (packages/clinical-rules/src/runRules.ts). */
const CURATED_TABLES_LIMITATION = "curated demo tables";

// ---- Patients (fictional; ids are eval-local, never seeded) -------------------------------------------------------

const HOLLOWAY: PatientContext = {
  id: "EVAL-PT-1001", firstName: "Margaret", lastName: "Holloway", dateOfBirth: "1952-03-14", sex: "F", phone: "555-0101", weightKg: 68,
  allergiesVerified: true, allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2025-02-11" }],
  conditions: [{ name: "Atrial fibrillation", icd10: "I48.91", status: "ACTIVE" }],
  medications: [{ name: "Warfarin (Coumadin)", genericName: "warfarin", dose: "5 mg", frequency: "once daily in the evening", startedAt: "2022-06-01", active: true }],
};

const REYES: PatientContext = {
  id: "EVAL-PT-1002", firstName: "Daniel", lastName: "Reyes", dateOfBirth: "1988-07-02", sex: "M", phone: "555-0102", weightKg: 84,
  allergiesVerified: true, allergies: [{ substance: "Penicillin", reaction: "Generalized hives within hours of a dose (2009)", severity: "MODERATE", recordedAt: "2009-08-20" }],
  conditions: [{ name: "Mild intermittent asthma", icd10: "J45.20", status: "ACTIVE" }],
  medications: [{ name: "Albuterol HFA inhaler", genericName: "albuterol", dose: "90 mcg/actuation", frequency: "2 puffs every 4-6 hours as needed", startedAt: "2015-01-10", active: true }],
};

const THOMPSON: PatientContext = {
  id: "EVAL-PT-1003", firstName: "Aisha", lastName: "Thompson", dateOfBirth: "1991-11-05", sex: "F", phone: "555-0103", weightKg: 61,
  allergiesVerified: true, allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2026-01-09" }],
  conditions: [{ name: "Seasonal allergic rhinitis", icd10: "J30.2", status: "ACTIVE" }],
  medications: [],
};

const OKONKWO: PatientContext = {
  id: "EVAL-PT-1004", firstName: "Grace", lastName: "Okonkwo", dateOfBirth: "1956-02-09", sex: "F", phone: "555-0104", weightKg: 74,
  allergiesVerified: true, allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2025-11-30" }],
  conditions: [{ name: "Hypertension", icd10: "I10", status: "ACTIVE" }],
  medications: [{ name: "Lisinopril", genericName: "lisinopril", dose: "10 mg", frequency: "once daily", startedAt: "2019-04-15", active: true }],
};

/** Allergy entries present but never verified with the patient. */
const VANCE_UNVERIFIED: PatientContext = {
  id: "EVAL-PT-1005", firstName: "Thomas", lastName: "Vance", dateOfBirth: "1979-05-21", sex: "M", phone: "555-0105", weightKg: 90,
  allergiesVerified: false, allergies: [{ substance: "Sulfa drugs", reaction: "rash", severity: "MILD", recordedAt: "2011-03-03" }],
  conditions: [], medications: [],
};

/** Verified flag set, but not a single allergy entry (not even NKDA). */
const PARK_NO_ENTRIES: PatientContext = {
  id: "EVAL-PT-1006", firstName: "Min-ji", lastName: "Park", dateOfBirth: "1995-09-12", sex: "F", phone: "555-0106", weightKg: 58,
  allergiesVerified: true, allergies: [], conditions: [], medications: [],
};

// ---- Helpers --------------------------------------------------------------------------------------------------------

type OracleMedication = Partial<LlmExtraction["medications"][number]> & { rawName: string };

/** The extraction a careful reader produces from the text; defaults filled by the extractor's own schema. */
function oracle(fields: Partial<Omit<LlmExtraction, "medications">> & { medications: OracleMedication[] }): LlmExtraction {
  return LlmExtractionSchema.parse({ overallConfidence: 0.97, ...fields, medications: fields.medications.map((m) => ({ confidence: 0.97, ...m })) });
}

function expectation(over: Partial<EvalExpectation> & Pick<EvalExpectation, "findings" | "absent" | "disposition">): EvalExpectation {
  return { therapyContext: null, limitations: [CURATED_TABLES_LIMITATION], forbiddenWords: [], evidence: [], absentEvidence: [], ...over };
}

const text = (s: string): EvalCaseSpec["source"] => ({ kind: "text", text: s });

const demoText = (key: string): string => {
  const scenario = findScenario(key);
  if (!scenario) throw new Error(`demo scenario ${key} not found in @autoscript/shared`);
  return scenario.text;
};

// ---- Rendered image for the ambiguous-extraction case ----------------------------------------------------------------

const NOISY_GROUND_TRUTH: GroundTruth = {
  patient: HOLLOWAY,
  patientAddress: "418 Riverbend Road, Springfield, IL 62704",
  prescriber: { name: "Dr. Elena Marchetti, DDS", clinic: "Riverbend Family Dental", street: "2200 Riverbend Road", cityState: "Springfield, IL 62704", phone: "555-0211", npi: "1999999901", dea: null },
  dateWritten: "2026-10-23",
  dateAsWritten: "10/23/2026",
  allergiesOnScript: "NKDA",
  medications: [{ writtenName: "Motrin", generic: "ibuprofen", strength: "600 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth every 8 hours as needed for pain", quantity: "21", refills: "0", indication: "pain" }],
  notes: null,
};

// ---- Cases -----------------------------------------------------------------------------------------------------------

export const CURATED_CASES: CuratedCaseSpec[] = [
  {
    id: "cur-warfarin-ibuprofen",
    title: "Warfarin (profile) + ibuprofen 7-day PRN course (demo text)",
    set: "curated",
    validation: CASE_VALIDATION["cur-warfarin-ibuprofen"],
    scenario: "WARFARIN_NSAID",
    source: text(demoText("warfarin-ibuprofen")),
    patient: HOLLOWAY,
    oracleExtraction: oracle({
      patientName: "Margaret Holloway", patientDateOfBirth: "1952-03-14", prescriberName: "Dr. Elena Marchetti, DDS", prescriberIdentifier: "1999999901", dateWritten: "2026-10-23",
      medications: [{ rawName: "Ibuprofen", strength: "600 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth every 8 hours with food as needed for dental pain", frequency: "every 8 hours", quantity: "21", refills: "0", indication: "post-extraction pain" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["interaction.pairwise/warfarin-nsaid"],
      absent: allFamiliesExcept("interaction.pairwise"),
      therapyContext: "ACUTE_SHORT_COURSE",
      disposition: "MANUAL_REVIEW_NEEDED",
      forbiddenWords: ["chronic"],
      evidence: [BEERS_SHORT_TERM],
      absentEvidence: [BEERS_CHRONIC],
    }),
  },
  {
    id: "cur-penicillin-amoxicillin",
    title: "Documented penicillin allergy + amoxicillin (demo text)",
    set: "curated",
    validation: CASE_VALIDATION["cur-penicillin-amoxicillin"],
    scenario: "PENICILLIN_AMOXICILLIN",
    source: text(demoText("amoxicillin-penicillin-allergy")),
    patient: REYES,
    oracleExtraction: oracle({
      patientName: "Daniel Reyes", patientDateOfBirth: "07/02/1988", prescriberName: "Dr. Samuel Okafor, MD", prescriberIdentifier: "1999999902", dateWritten: "10/23/2026",
      medications: [{ rawName: "Amoxicillin", strength: "500 mg", form: "capsule", route: "PO", sig: "1 capsule PO TID x 10 days", frequency: "TID", quantity: "30", refills: "0", duration: "10 days", indication: "acute bacterial sinusitis" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({ findings: ["allergy.cross-reactivity"], absent: allFamiliesExcept("allergy.cross-reactivity"), disposition: "MANUAL_REVIEW_NEEDED" }),
  },
  {
    id: "cur-lisinopril-ibuprofen",
    title: "Lisinopril (profile) + ibuprofen 7-day PRN course: cited to the lisinopril label 7.3, not to Beers",
    set: "curated",
    validation: CASE_VALIDATION["cur-lisinopril-ibuprofen"],
    scenario: "ACE_INHIBITOR_NSAID",
    source: text(`WESTFIELD URGENT CARE
Prescriber: Dr. Hannah Lindqvist, MD   NPI 1999999904
Date: 2026-10-22

Patient: Grace Okonkwo   DOB: 1956-02-09   Phone: (555) 010-0104

Rx: Ibuprofen 400 mg tablets
Sig: Take 1 tablet by mouth every 8 hours as needed for pain
Disp: #21   Refills: 0
Dx: ankle sprain

H. Lindqvist MD`),
    patient: OKONKWO,
    oracleExtraction: oracle({
      patientName: "Grace Okonkwo", patientDateOfBirth: "1956-02-09", prescriberName: "Dr. Hannah Lindqvist, MD", prescriberIdentifier: "1999999904", dateWritten: "2026-10-22",
      medications: [{ rawName: "Ibuprofen", strength: "400 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth every 8 hours as needed for pain", frequency: "every 8 hours", quantity: "21", refills: "0", indication: "ankle sprain" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["interaction.pairwise/ace-inhibitor-nsaid"],
      absent: allFamiliesExcept("interaction.pairwise"),
      therapyContext: "ACUTE_SHORT_COURSE",
      disposition: "MANUAL_REVIEW_NEEDED",
      forbiddenWords: ["chronic"],
      evidence: [LISINOPRIL_7_3],
      absentEvidence: [BEERS_CHRONIC],
    }),
  },
  {
    id: "cur-no-patient",
    title: "Complete prescription, no patient record linked",
    set: "curated",
    validation: CASE_VALIDATION["cur-no-patient"],
    scenario: "NO_PATIENT",
    source: text(`HARBORVIEW MEDICAL GROUP
Prescriber: Dr. Omar Haddad, MD   NPI 1999999905
Date: 2026-10-21

Patient: Jonathan Whitfield   DOB: 1983-04-17

Rx: Cetirizine 10 mg tablets
Sig: Take 1 tablet by mouth once daily
Qty: 30   Refills: 1

O. Haddad MD`),
    patient: null,
    oracleExtraction: oracle({
      patientName: "Jonathan Whitfield", patientDateOfBirth: "1983-04-17", prescriberName: "Dr. Omar Haddad, MD", prescriberIdentifier: "1999999905", dateWritten: "2026-10-21",
      medications: [{ rawName: "Cetirizine", strength: "10 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth once daily", frequency: "once daily", quantity: "30", refills: "1" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["context.no-patient"],
      absent: allFamiliesExcept("context.no-patient"),
      limitations: [CURATED_TABLES_LIMITATION, "No patient record"],
      disposition: "MANUAL_REVIEW_NEEDED",
    }),
  },
  {
    id: "cur-allergy-unverified",
    title: "Allergy entries never verified with the patient (allergiesVerified: false)",
    set: "curated",
    validation: CASE_VALIDATION["cur-allergy-unverified"],
    scenario: "ALLERGY_HISTORY",
    source: text(`HARBORVIEW MEDICAL GROUP
Prescriber: Dr. Omar Haddad, MD   NPI 1999999905
Date: 2026-10-21

Patient: Thomas Vance   DOB: 1979-05-21

Rx: Cetirizine 10 mg tablets
Sig: Take 1 tablet by mouth once daily
Qty: 30   Refills: 1

O. Haddad MD`),
    patient: VANCE_UNVERIFIED,
    oracleExtraction: oracle({
      patientName: "Thomas Vance", patientDateOfBirth: "1979-05-21", prescriberName: "Dr. Omar Haddad, MD", prescriberIdentifier: "1999999905", dateWritten: "2026-10-21",
      medications: [{ rawName: "Cetirizine", strength: "10 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth once daily", frequency: "once daily", quantity: "30", refills: "1" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({ findings: ["context.allergy-history"], absent: allFamiliesExcept("context.allergy-history"), disposition: "MANUAL_REVIEW_NEEDED" }),
  },
  {
    id: "cur-allergy-no-entries",
    title: "Profile marked verified but without any allergy entry",
    set: "curated",
    validation: CASE_VALIDATION["cur-allergy-no-entries"],
    scenario: "ALLERGY_HISTORY",
    source: text(`HARBORVIEW MEDICAL GROUP
Prescriber: Dr. Omar Haddad, MD   NPI 1999999905
Date: 2026-10-21

Patient: Min-ji Park   DOB: 1995-09-12

Rx: Cetirizine 10 mg tablets
Sig: Take 1 tablet by mouth once daily
Qty: 30   Refills: 1

O. Haddad MD`),
    patient: PARK_NO_ENTRIES,
    oracleExtraction: oracle({
      patientName: "Min-ji Park", patientDateOfBirth: "1995-09-12", prescriberName: "Dr. Omar Haddad, MD", prescriberIdentifier: "1999999905", dateWritten: "2026-10-21",
      medications: [{ rawName: "Cetirizine", strength: "10 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth once daily", frequency: "once daily", quantity: "30", refills: "1" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({ findings: ["context.allergy-history"], absent: allFamiliesExcept("context.allergy-history"), disposition: "MANUAL_REVIEW_NEEDED" }),
  },
  {
    id: "cur-no-flags",
    title: "Cetirizine for a verified-NKDA patient with no interacting medications (demo text)",
    set: "curated",
    validation: CASE_VALIDATION["cur-no-flags"],
    scenario: "NO_FLAGS",
    source: text(demoText("no-flags")),
    patient: THOMPSON,
    oracleExtraction: oracle({
      patientName: "Aisha Thompson", patientDateOfBirth: "1991-11-05", prescriberName: "Dr. Priya Natarajan, MD", prescriberIdentifier: "1999999903", dateWritten: "2026-10-24",
      medications: [{ rawName: "Cetirizine", strength: "10 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth once daily for seasonal allergies", frequency: "once daily", quantity: "30", refills: "2", indication: "seasonal allergies" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({ findings: [], absent: [...ALL_RULE_FAMILIES], disposition: "NO_FLAGS_DETECTED" }),
  },
  {
    id: "cur-unrecognized-drug",
    title: "Invented drug name alongside a recognized one, patient linked",
    set: "curated",
    validation: CASE_VALIDATION["cur-unrecognized-drug"],
    scenario: "UNRECOGNIZED_DRUG",
    source: text(`LAKESIDE INTERNAL MEDICINE
Prescriber: Dr. Priya Natarajan, MD   NPI 1999999903
Date: 2026-10-24

Patient: Aisha Thompson   DOB: 1991-11-05   Phone: (555) 010-1003

1) Zelmoravix 20 mg tablets - 1 tablet by mouth every morning   #30   Refills: 0
2) Cetirizine 10 mg tablets - 1 tablet by mouth once daily     #30   Refills: 2

P. Natarajan MD`),
    patient: THOMPSON,
    oracleExtraction: oracle({
      patientName: "Aisha Thompson", patientDateOfBirth: "1991-11-05", prescriberName: "Dr. Priya Natarajan, MD", prescriberIdentifier: "1999999903", dateWritten: "2026-10-24",
      medications: [
        { rawName: "Zelmoravix", strength: "20 mg", form: "tablet", route: "by mouth", sig: "1 tablet by mouth every morning", frequency: "every morning", quantity: "30", refills: "0" },
        { rawName: "Cetirizine", strength: "10 mg", form: "tablet", route: "by mouth", sig: "1 tablet by mouth once daily", frequency: "once daily", quantity: "30", refills: "2" },
      ],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["rx.unresolved-drug"],
      // The extractor may legitimately report low confidence on an invented name, so rx.extraction-confidence is left unlabelled.
      absent: allFamiliesExcept("rx.unresolved-drug", "rx.extraction-confidence"),
      limitations: [CURATED_TABLES_LIMITATION, "could not be normalized"],
      disposition: "MANUAL_REVIEW_NEEDED",
    }),
  },
  {
    id: "cur-handwritten-noisy",
    title: "Handwriting font, noisy scan: Motrin 600 mg PRN for the warfarin patient",
    set: "curated",
    validation: CASE_VALIDATION["cur-handwritten-noisy"],
    scenario: "AMBIGUOUS_EXTRACTION",
    source: { kind: "render", groundTruth: NOISY_GROUND_TRUTH, style: "handwritten", difficulty: "noisy", seed: 7001 },
    patient: HOLLOWAY,
    oracleExtraction: oracle({
      patientName: "Margaret Holloway", patientDateOfBirth: "03/14/1952", prescriberName: "Dr. Elena Marchetti, DDS", prescriberIdentifier: "1999999901", dateWritten: "10/23/2026",
      medications: [{ rawName: "Motrin", strength: "600 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth every 8 hours as needed for pain", frequency: "every 8 hours", quantity: "21", refills: "0", indication: "pain" }],
      statedAllergies: ["NKDA"],
    }),
    groundTruth: NOISY_GROUND_TRUTH,
    injectedErrors: [],
    expected: expectation({
      findings: ["interaction.pairwise/warfarin-nsaid"],
      // Extraction-quality findings are expected to vary with the scan and are reported unlabelled.
      absent: allFamiliesExcept("interaction.pairwise", "rx.extraction-confidence", "rx.missing-fields"),
      therapyContext: "ACUTE_SHORT_COURSE",
      disposition: "MANUAL_REVIEW_NEEDED",
      forbiddenWords: ["chronic"],
      evidence: [BEERS_SHORT_TERM],
      absentEvidence: [BEERS_CHRONIC],
    }),
  },
  {
    id: "cur-nsaid-short-course",
    title: "Naproxen 5-day course for the warfarin patient (short course)",
    set: "curated",
    validation: CASE_VALIDATION["cur-nsaid-short-course"],
    scenario: "NSAID_SHORT_COURSE",
    source: text(`RIVERBEND FAMILY DENTAL - PRESCRIPTION
Prescriber: Dr. Elena Marchetti, DDS   NPI 1999999901
Date: 2026-10-23

Patient: Margaret Holloway     DOB: 1952-03-14

Rx: Naproxen 500 mg tablets
Sig: Take 1 tablet by mouth twice daily with food for 5 days
Disp: #10      Refills: 0
Indication: post-extraction pain

Signature: E. Marchetti`),
    patient: HOLLOWAY,
    oracleExtraction: oracle({
      patientName: "Margaret Holloway", patientDateOfBirth: "1952-03-14", prescriberName: "Dr. Elena Marchetti, DDS", prescriberIdentifier: "1999999901", dateWritten: "2026-10-23",
      medications: [{ rawName: "Naproxen", strength: "500 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth twice daily with food for 5 days", frequency: "twice daily", quantity: "10", refills: "0", duration: "5 days", indication: "post-extraction pain" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["interaction.pairwise/warfarin-nsaid"],
      absent: allFamiliesExcept("interaction.pairwise"),
      therapyContext: "ACUTE_SHORT_COURSE",
      disposition: "MANUAL_REVIEW_NEEDED",
      forbiddenWords: ["chronic"],
      evidence: [BEERS_SHORT_TERM],
      absentEvidence: [BEERS_CHRONIC],
    }),
  },
  {
    id: "cur-nsaid-chronic",
    title: "Naproxen 90-day supply with refills for the same warfarin patient (ongoing therapy)",
    set: "curated",
    validation: CASE_VALIDATION["cur-nsaid-chronic"],
    scenario: "NSAID_CHRONIC",
    source: text(`SPRINGFIELD RHEUMATOLOGY ASSOCIATES
Prescriber: Dr. Nadia Rahimi, MD   NPI 1999999906
Date: 2026-10-23

Patient: Margaret Holloway     DOB: 1952-03-14

Rx: Naproxen 500 mg tablets
Sig: Take 1 tablet by mouth twice daily with food
Disp: #60      Refills: 3
Indication: osteoarthritis

N. Rahimi MD`),
    patient: HOLLOWAY,
    oracleExtraction: oracle({
      patientName: "Margaret Holloway", patientDateOfBirth: "1952-03-14", prescriberName: "Dr. Nadia Rahimi, MD", prescriberIdentifier: "1999999906", dateWritten: "2026-10-23",
      medications: [{ rawName: "Naproxen", strength: "500 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth twice daily with food", frequency: "twice daily", quantity: "60", refills: "3", indication: "osteoarthritis" }],
    }),
    groundTruth: null,
    injectedErrors: [],
    expected: expectation({
      findings: ["interaction.pairwise/warfarin-nsaid"],
      absent: allFamiliesExcept("interaction.pairwise"),
      therapyContext: "CHRONIC",
      disposition: "MANUAL_REVIEW_NEEDED",
      evidence: [BEERS_CHRONIC],
    }),
  },
];
