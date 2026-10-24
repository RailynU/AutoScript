import type { PatientContext } from "@autoscript/shared";
import { CITIES, DRUG_CATALOG, FIRST_NAMES, LAST_NAMES, PRESCRIBERS, SAFE_GENERICS, STREETS, drugByGeneric, type CatalogDrug } from "./catalog.js";
import type { Rng } from "./rng.js";
import type { GroundTruth, GroundTruthMedication, InjectedErrorCode, ScenarioKind } from "./schema.js";

export interface GeneratedCase {
  scenario: ScenarioKind;
  groundTruth: GroundTruth;
  injectedErrors: Array<{ code: InjectedErrorCode; detail: string }>;
}

/** Interaction pairs from packages/clinical-rules/src/interactions.ts, by catalog generic. */
const INTERACTION_PAIRS: Array<[string[], string[]]> = [
  [["warfarin"], ["ibuprofen", "naproxen", "meloxicam", "celecoxib"]],
  [["warfarin"], ["sulfamethoxazole-trimethoprim"]],
  [["warfarin"], ["fluconazole"]],
  [["warfarin"], ["metronidazole"]],
  [["sertraline", "escitalopram"], ["ibuprofen", "naproxen"]],
  [["oxycodone", "hydrocodone-acetaminophen", "tramadol"], ["alprazolam", "lorazepam"]],
  [["lisinopril"], ["ibuprofen", "naproxen"]],
  [["simvastatin"], ["clarithromycin"]],
];

const ALLERGY_CASES: Array<{ allergy: string; reaction: string; generic: string; cross: boolean }> = [
  { allergy: "Penicillin", reaction: "hives", generic: "amoxicillin", cross: false },
  { allergy: "Penicillin", reaction: "anaphylaxis", generic: "amoxicillin-clavulanate", cross: false },
  { allergy: "Penicillin", reaction: "rash", generic: "cephalexin", cross: true },
  { allergy: "Sulfa drugs", reaction: "Stevens-Johnson syndrome", generic: "sulfamethoxazole-trimethoprim", cross: false },
  { allergy: "NSAIDs", reaction: "angioedema", generic: "ibuprofen", cross: false },
];

const CONDITION_CASES: Array<{ condition: string; icd10: string; generic: string }> = [
  { condition: "Chronic kidney disease stage 3", icd10: "N18.30", generic: "ibuprofen" },
  { condition: "Chronic kidney disease stage 3", icd10: "N18.30", generic: "naproxen" },
  { condition: "Heart failure with reduced ejection fraction", icd10: "I50.22", generic: "meloxicam" },
  { condition: "Peptic ulcer disease", icd10: "K27.9", generic: "naproxen" },
  { condition: "Asthma", icd10: "J45.909", generic: "propranolol" },
  { condition: "CKD stage 4", icd10: "N18.4", generic: "metformin" },
];

const BACKGROUND: Array<{ condition: string; icd10: string; generic: string }> = [
  { condition: "Hypertension", icd10: "I10", generic: "amlodipine" },
  { condition: "Hyperlipidemia", icd10: "E78.5", generic: "atorvastatin" },
  { condition: "Hypothyroidism", icd10: "E03.9", generic: "levothyroxine" },
  { condition: "GERD", icd10: "K21.9", generic: "omeprazole" },
  { condition: "Type 2 diabetes mellitus", icd10: "E11.9", generic: "metformin" },
  { condition: "Seasonal allergic rhinitis", icd10: "J30.2", generic: "cetirizine" },
];

const pad = (n: number): string => String(n).padStart(2, "0");

function isoDate(rng: Rng, fromYear: number, toYear: number): string {
  return `${rng.int(fromYear, toYear)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`;
}

export function isoToWritten(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function medFromCatalog(rng: Rng, drug: CatalogDrug, over: Partial<GroundTruthMedication> = {}): GroundTruthMedication {
  return {
    writtenName: rng.pick(drug.written),
    generic: drug.generic,
    strength: rng.pick(drug.strengths),
    form: drug.form,
    route: drug.route,
    sig: rng.pick(drug.sigs),
    quantity: rng.pick(drug.quantities),
    refills: drug.controlled ? "0" : String(rng.pick([0, 0, 1, 2, 3])),
    indication: rng.chance(0.4) ? drug.indication : null,
    ...over,
  };
}

function patientMedication(rng: Rng, generic: string): PatientContext["medications"][number] {
  const drug = drugByGeneric(generic);
  return { name: rng.pick(drug.written), genericName: generic, dose: rng.pick(drug.strengths), frequency: rng.pick(drug.sigs).replace(/^Take \d+ \w+ by mouth /, ""), startedAt: isoDate(rng, 2023, 2025), active: true };
}

function basePatient(rng: Rng, index: number, excludeGenerics: string[]): PatientContext {
  const background = rng.shuffle(BACKGROUND).filter((b) => !excludeGenerics.includes(b.generic)).slice(0, rng.int(0, 2));
  return {
    id: `US-${String(index + 1).padStart(4, "0")}`,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    dateOfBirth: isoDate(rng, 1940, 2004),
    sex: rng.pick(["F", "M"]),
    phone: `555-01${pad(rng.int(0, 99))}`,
    weightKg: rng.int(48, 118),
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: isoDate(rng, 2024, 2026) }],
    conditions: background.map((b) => ({ name: b.condition, icd10: b.icd10, status: "ACTIVE" as const })),
    medications: background.map((b) => patientMedication(rng, b.generic)),
  };
}

function withAllergy(p: PatientContext, substance: string, reaction: string): PatientContext {
  return { ...p, allergies: [{ substance, reaction, severity: "SEVERE", recordedAt: "2024-05-10" }] };
}

function withCondition(p: PatientContext, name: string, icd10: string): PatientContext {
  return { ...p, conditions: [...p.conditions, { name, icd10, status: "ACTIVE" }] };
}

function withMedication(rng: Rng, p: PatientContext, generic: string): PatientContext {
  return { ...p, medications: [...p.medications, patientMedication(rng, generic)] };
}

function groundTruth(rng: Rng, patient: PatientContext, medications: GroundTruthMedication[], over: Partial<GroundTruth> = {}): GroundTruth {
  const prescriber = rng.pick(PRESCRIBERS);
  const date = isoDate(rng, 2025, 2026);
  const controlled = medications.some((m) => m.generic && drugByGeneric(m.generic).controlled);
  const allergyText = patient.allergies.map((a) => a.substance).join(", ");
  return {
    patient,
    patientAddress: `${rng.int(10, 9800)} ${rng.pick(STREETS)}, ${rng.pick(CITIES)}`,
    prescriber: { ...prescriber, phone: `555-02${pad(rng.int(0, 99))}`, npi: `19${String(rng.int(0, 99999999)).padStart(8, "0")}`, dea: controlled ? `F${prescriber.name.split(" ")[1]![0]}${String(rng.int(0, 9999999)).padStart(7, "0")}` : null },
    dateWritten: date,
    dateAsWritten: isoToWritten(date),
    allergiesOnScript: rng.chance(0.7) ? allergyText : null,
    medications,
    notes: null,
    ...over,
  };
}

function cleanCase(rng: Rng, index: number): GeneratedCase {
  const picks = rng.shuffle(SAFE_GENERICS).slice(0, rng.int(1, 3));
  const patient = basePatient(rng, index, picks);
  return { scenario: "CLEAN", groundTruth: groundTruth(rng, patient, picks.map((g) => medFromCatalog(rng, drugByGeneric(g)))), injectedErrors: [] };
}

function interactionCase(rng: Rng, index: number): GeneratedCase {
  const [left, right] = rng.pick(INTERACTION_PAIRS);
  const a = rng.pick(left);
  const b = rng.pick(right);
  const onScript = rng.chance(0.5);
  let patient = basePatient(rng, index, [a, b]);
  const medications = [medFromCatalog(rng, drugByGeneric(b))];
  if (onScript) medications.unshift(medFromCatalog(rng, drugByGeneric(a)));
  else patient = withMedication(rng, patient, a);
  return {
    scenario: "INTERACTION",
    groundTruth: groundTruth(rng, patient, medications),
    injectedErrors: [{ code: onScript ? "INTERACTION_ON_PRESCRIPTION" : "INTERACTION_WITH_PROFILE", detail: `${a} + ${b}${onScript ? " both on the prescription" : ` (${a} is an active profile medication)`}` }],
  };
}

function allergyCase(rng: Rng, index: number): GeneratedCase {
  const c = rng.pick(ALLERGY_CASES);
  const patient = withAllergy(basePatient(rng, index, [c.generic]), c.allergy, c.reaction);
  return {
    scenario: "ALLERGY",
    groundTruth: groundTruth(rng, patient, [medFromCatalog(rng, drugByGeneric(c.generic))]),
    injectedErrors: [{ code: c.cross ? "ALLERGY_CROSS_REACTIVITY" : "ALLERGY_CONFLICT", detail: `${c.generic} prescribed to a patient with documented ${c.allergy} allergy (${c.reaction})` }],
  };
}

function doseCase(rng: Rng, index: number): GeneratedCase {
  const variant = rng.pick([
    { generic: "acetaminophen", strength: "500 mg", sig: "Take 2 tablets by mouth every 4 hours for pain", quantity: "120", detail: "acetaminophen 1,000 mg six times daily = 6,000 mg/day (limit 4,000)" },
    { generic: "acetaminophen", strength: "500 mg", sig: "Take 2 tablets by mouth every 4 hours as needed", quantity: "100", detail: "acetaminophen 1,000 mg six times daily = 6,000 mg/day (limit 4,000)" },
    { generic: "ibuprofen", strength: "800 mg", sig: "Take 1 tablet by mouth every 4 hours", quantity: "60", detail: "ibuprofen 800 mg six times daily = 4,800 mg/day (limit 3,200)" },
    { generic: "ibuprofen", strength: "800 mg", sig: "Take 2 tablets by mouth every 6 hours with food", quantity: "60", detail: "ibuprofen 1,600 mg four times daily = 6,400 mg/day (limit 3,200)" },
  ]);
  const patient = basePatient(rng, index, [variant.generic]);
  const med = medFromCatalog(rng, drugByGeneric(variant.generic), { strength: variant.strength, sig: variant.sig, quantity: variant.quantity });
  return { scenario: "DOSE", groundTruth: groundTruth(rng, patient, [med]), injectedErrors: [{ code: "DOSE_ABOVE_MAXIMUM", detail: variant.detail }] };
}

function duplicateCase(rng: Rng, index: number): GeneratedCase {
  const pair = rng.pick([
    ["ibuprofen", "naproxen"],
    ["sertraline", "escitalopram"],
    ["omeprazole", "omeprazole"],
    ["lisinopril", "lisinopril"],
    ["atorvastatin", "simvastatin"],
  ]);
  const onScript = rng.chance(0.5);
  let patient = basePatient(rng, index, pair);
  const medications = [medFromCatalog(rng, drugByGeneric(pair[1]!))];
  if (onScript) medications.unshift(medFromCatalog(rng, drugByGeneric(pair[0]!)));
  else patient = withMedication(rng, patient, pair[0]!);
  return {
    scenario: "DUPLICATE",
    groundTruth: groundTruth(rng, patient, medications),
    injectedErrors: [{ code: "DUPLICATE_THERAPY", detail: `${pair[0]} and ${pair[1]}${onScript ? " on the same prescription" : ` (${pair[0]} already active on the profile)`}` }],
  };
}

function conditionCase(rng: Rng, index: number): GeneratedCase {
  const c = rng.pick(CONDITION_CASES);
  const patient = withCondition(basePatient(rng, index, [c.generic]), c.condition, c.icd10);
  return {
    scenario: "CONDITION",
    groundTruth: groundTruth(rng, patient, [medFromCatalog(rng, drugByGeneric(c.generic))]),
    injectedErrors: [{ code: "CONDITION_CONTRAINDICATION", detail: `${c.generic} prescribed with documented ${c.condition}` }],
  };
}

function missingFieldCase(rng: Rng, index: number): GeneratedCase {
  const base = cleanCase(rng, index);
  const which = rng.pick(["MISSING_STRENGTH", "MISSING_DIRECTIONS", "MISSING_QUANTITY", "MISSING_DATE", "MISSING_PRESCRIBER"] as const);
  const meds = base.groundTruth.medications;
  const first = meds[0]!;
  const gt = base.groundTruth;
  const patched: GroundTruth =
    which === "MISSING_STRENGTH" ? { ...gt, medications: [{ ...first, strength: null }, ...meds.slice(1)] }
    : which === "MISSING_DIRECTIONS" ? { ...gt, medications: [{ ...first, sig: null }, ...meds.slice(1)] }
    : which === "MISSING_QUANTITY" ? { ...gt, medications: [{ ...first, quantity: null }, ...meds.slice(1)] }
    : which === "MISSING_DATE" ? { ...gt, dateWritten: null, dateAsWritten: null }
    : { ...gt, prescriber: { ...gt.prescriber, name: null } };
  return { scenario: "MISSING_FIELD", groundTruth: patched, injectedErrors: [{ code: which, detail: `${which.toLowerCase().replace("_", " ")} omitted${which.startsWith("MISSING_D") || which === "MISSING_PRESCRIBER" ? "" : ` for ${first.writtenName}`}` }] };
}

const FAKE_DRUGS = ["Zelmoravix", "Cortanil", "Veltrazone", "Ambrexil"];

function unrecognizedCase(rng: Rng, index: number): GeneratedCase {
  const base = cleanCase(rng, index);
  const fake: GroundTruthMedication = { writtenName: rng.pick(FAKE_DRUGS), generic: null, strength: `${rng.pick([10, 20, 40])} mg`, form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth once daily", quantity: "30", refills: "0", indication: null };
  return { scenario: "UNRECOGNIZED_DRUG", groundTruth: { ...base.groundTruth, medications: [fake, ...base.groundTruth.medications] }, injectedErrors: [{ code: "UNRECOGNIZED_DRUG", detail: `${fake.writtenName} is not a real drug and cannot be normalized` }] };
}

const SCENARIO_WEIGHTS: Array<[ScenarioKind, number]> = [
  ["CLEAN", 35], ["INTERACTION", 20], ["ALLERGY", 10], ["DOSE", 7], ["DUPLICATE", 7], ["CONDITION", 8], ["MISSING_FIELD", 8], ["UNRECOGNIZED_DRUG", 5],
];

const BUILDERS: Record<ScenarioKind, (rng: Rng, index: number) => GeneratedCase> = {
  CLEAN: cleanCase, INTERACTION: interactionCase, ALLERGY: allergyCase, DOSE: doseCase, DUPLICATE: duplicateCase, CONDITION: conditionCase, MISSING_FIELD: missingFieldCase, UNRECOGNIZED_DRUG: unrecognizedCase,
};

export function pickScenario(rng: Rng): ScenarioKind {
  const total = SCENARIO_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [kind, w] of SCENARIO_WEIGHTS) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return "CLEAN";
}

export function generateCase(rng: Rng, index: number, scenario: ScenarioKind = pickScenario(rng)): GeneratedCase {
  return BUILDERS[scenario](rng, index);
}

export const CATALOG_SIZE = DRUG_CATALOG.length;
