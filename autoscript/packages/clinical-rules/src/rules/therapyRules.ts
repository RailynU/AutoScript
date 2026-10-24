import { computeDailyDose, MAX_DAILY_DOSE_MG } from "../dose";
import { classifyTherapyContext, type TherapyContextResult } from "../therapyContext";
import type { Rule, RuleFinding } from "../types";
import { describe, finding, resolvePatientMeds, resolvePrescribed, therapyContextFor, type ResolvedMed } from "./helpers";
import { BEERS_REFERENCE_ID, beersShortCourseNote, excludedSectionsFor, joinSentences, therapyContextSentence } from "./therapyWording";

const DUPLICATE_CLASSES = new Set(["NSAID", "SSRI", "ACE_INHIBITOR", "BETA_BLOCKER", "PPI", "STATIN", "BENZODIAZEPINE", "OPIOID"]);

function duplicateGuidance(ctx: TherapyContextResult): string {
  switch (ctx.context) {
    case "ACUTE_SHORT_COURSE":
      return "Confirm whether the existing therapy should be held or continued during this short course, or whether this is an unintended duplication.";
    case "CHRONIC":
      return "Confirm whether this is intentional (e.g., a dose change or replacement) or an unintended duplication.";
    case "UNKNOWN":
      return "Confirm whether this is intentional (a dose change, a replacement or a limited course alongside the existing therapy) or an unintended duplication.";
  }
}

/** The Beers NSAID criterion is the only curated reference for duplicates, and it speaks only to NSAIDs. */
function duplicateReferenceIds(a: ResolvedMed, b: ResolvedMed, ctx: TherapyContextResult): string[] {
  const nsaid = a.classes.includes("NSAID") || b.classes.includes("NSAID");
  if (!nsaid || ctx.context === "ACUTE_SHORT_COURSE") return [];
  return [BEERS_REFERENCE_ID];
}

export const duplicateTherapyRule: Rule = {
  id: "therapy.duplicate",
  description: "Flags the same generic, or two drugs from the same class, across the prescription and active patient medications.",
  run({ extraction, patient }) {
    const { resolved } = resolvePrescribed(extraction.medications);
    const pool = [...resolved, ...(patient ? resolvePatientMeds(patient.medications) : [])];
    const findings: RuleFinding[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i]!;
        const b = pool[j]!;
        if (a.source === "PATIENT_RECORD" && b.source === "PATIENT_RECORD") continue;
        const sameGeneric = a.generic === b.generic;
        const sharedClass = a.classes.find((c) => DUPLICATE_CLASSES.has(c) && b.classes.includes(c));
        if (!sameGeneric && !sharedClass) continue;
        const key = [a.generic, b.generic].sort().join("+");
        if (seen.has(key)) continue;
        seen.add(key);
        const ctx = therapyContextFor([a, b]);
        const referenceIds = duplicateReferenceIds(a, b, ctx);
        const nsaid = a.classes.includes("NSAID") || b.classes.includes("NSAID");
        findings.push(
          finding({
            type: "DUPLICATE_THERAPY",
            severity: sameGeneric ? "MODERATE" : "LOW",
            title: sameGeneric ? `Duplicate therapy: ${a.generic} appears twice` : `Same-class therapy: ${a.generic} and ${b.generic} (${sharedClass})`,
            explanation: joinSentences([
              `${describe(a)} and ${describe(b)} ${sameGeneric ? "are the same drug" : `are both ${sharedClass} agents`}.`,
              therapyContextSentence(ctx),
              duplicateGuidance(ctx),
              nsaid ? beersShortCourseNote(ctx.context, referenceIds.includes(BEERS_REFERENCE_ID), "NSAID criterion") : null,
            ]),
            origin: "therapy.duplicate",
            medications: [a.generic, b.generic],
            reviewQuestions: ["Is this a replacement for the existing therapy or an addition?", "Should the earlier prescription be discontinued on the profile?"],
            referenceIds,
            retrievalQuery: `${a.generic} ${b.generic} duplicate therapy`,
            therapyContext: ctx,
          }),
        );
      }
    }
    return findings;
  },
};

function doseGuidance(ctx: TherapyContextResult): string {
  switch (ctx.context) {
    case "ACUTE_SHORT_COURSE":
      return "The labeled daily maximum is exceeded even though this is a short course; confirm the intended dose before dispensing.";
    case "CHRONIC":
      return "The excess is sustained over ongoing therapy, which compounds the labeled organ-toxicity risk; confirm the intended dose and the monitoring plan.";
    case "UNKNOWN":
      return "Confirm the intended dose and the intended duration with the prescriber.";
  }
}

export const doseLimitRule: Rule = {
  id: "dose.daily-maximum",
  description: "Computes a daily dose from strength and frequency for a small set of drugs and compares it with the labeled maximum.",
  run({ extraction }) {
    const findings: RuleFinding[] = [];
    for (const med of extraction.medications) {
      const generic = med.normalizedName;
      if (!generic) continue;
      const limit = MAX_DAILY_DOSE_MG[generic];
      if (!limit) continue;
      const dose = computeDailyDose(med.strength, med.sig, med.frequency);
      if (!dose) continue;
      if (dose.mgPerDay <= limit.maxMg) continue;
      const ctx = classifyTherapyContext(med);
      findings.push(
        finding({
          type: "DOSE_CONCERN",
          severity: "HIGH",
          title: `${generic}: computed daily dose ${dose.mgPerDay} mg exceeds ${limit.maxMg} mg`,
          explanation: joinSentences([
            `${med.rawName}: ${dose.mgPerUnit} mg x ${dose.unitsPerDose} per dose x ${dose.dosesPerDay} doses/day = ${dose.mgPerDay} mg/day.`,
            limit.note,
            therapyContextSentence(ctx),
            doseGuidance(ctx),
          ]),
          origin: "dose.daily-maximum",
          medications: [generic],
          reviewQuestions: ["Confirm the intended dose with the prescriber.", "Does the patient take other products containing the same ingredient?"],
          referenceIds: limit.referenceIds,
          retrievalQuery: `${generic} maximum daily dose`,
          therapyContext: ctx,
        }),
      );
    }
    return findings;
  },
};

interface ConditionConflict {
  condition: string;
  why: string;
  referenceIds: string[];
  /** Which part of the Beers document the citation rests on, when Beers is cited. */
  beersEntry: string | null;
}

function conditionGuidance(ctx: TherapyContextResult): string {
  switch (ctx.context) {
    case "ACUTE_SHORT_COURSE":
      return "A short course does not remove this concern: the cited caution applies to any exposure in this condition, so confirm the prescriber was aware of it and what monitoring is planned for the course.";
    case "CHRONIC":
      return "With ongoing therapy the exposure is sustained; confirm the prescriber was aware of the condition and whether a safer alternative or a monitoring plan exists.";
    case "UNKNOWN":
      return "Confirm the prescriber was aware of the condition, the intended duration, and whether a safer alternative or a monitoring plan exists.";
  }
}

export const conditionRule: Rule = {
  id: "condition.contraindication",
  description: "Checks prescribed drug classes against a small list of documented patient conditions.",
  run({ extraction, patient }) {
    if (!patient) return [];
    const { resolved } = resolvePrescribed(extraction.medications);
    const conditions = patient.conditions.filter((c) => c.status === "ACTIVE").map((c) => c.name.toLowerCase());
    const has = (...needles: string[]) => conditions.some((c) => needles.some((n) => c.includes(n)));
    const findings: RuleFinding[] = [];
    for (const med of resolved) {
      const conflicts: ConditionConflict[] = [];
      if (med.classes.includes("NSAID") && has("chronic kidney", "ckd", "renal insufficiency", "kidney disease")) {
        conflicts.push({ condition: "chronic kidney disease", why: "NSAIDs reduce renal perfusion and can worsen kidney function.", referenceIds: [BEERS_REFERENCE_ID], beersEntry: "disease-drug interaction entry for kidney disease" });
      }
      if (med.classes.includes("NSAID") && has("peptic ulcer", "gi bleed", "gastrointestinal bleed")) {
        conflicts.push({ condition: "history of peptic ulcer / GI bleeding", why: "NSAIDs are associated with recurrent ulceration and bleeding.", referenceIds: [BEERS_REFERENCE_ID, "fda-ibuprofen-label-anticoagulants"], beersEntry: "disease-drug interaction entry for ulcer history" });
      }
      if (med.classes.includes("NSAID") && has("heart failure")) {
        conflicts.push({ condition: "heart failure", why: "NSAIDs promote fluid retention and can exacerbate heart failure.", referenceIds: [BEERS_REFERENCE_ID], beersEntry: "disease-drug interaction entry for heart failure" });
      }
      if (med.generic === "propranolol" && has("asthma")) {
        conflicts.push({ condition: "asthma", why: "Non-selective beta-blockade can provoke bronchospasm.", referenceIds: ["fda-propranolol-label-asthma"], beersEntry: null });
      }
      if (med.generic === "metformin" && has("ckd stage 4", "ckd stage 5", "esrd", "end-stage renal")) {
        conflicts.push({ condition: "advanced kidney disease", why: "Metformin is contraindicated with eGFR below 30 mL/min/1.73 m2 because of lactic acidosis risk.", referenceIds: ["fda-metformin-label-renal"], beersEntry: null });
      }
      if (conflicts.length === 0) continue;
      const ctx = therapyContextFor([med]);
      for (const conflict of conflicts) findings.push(conditionFinding(med, conflict, ctx));
    }
    return findings;
  },
};

function conditionFinding(med: ResolvedMed, conflict: ConditionConflict, ctx: TherapyContextResult): RuleFinding {
  return finding({
    type: "CONDITION_CONFLICT",
    severity: "HIGH",
    title: `${med.generic} with documented ${conflict.condition}`,
    explanation: joinSentences([
      `${med.label} is prescribed to a patient whose record lists ${conflict.condition}.`,
      conflict.why,
      therapyContextSentence(ctx),
      conditionGuidance(ctx),
      conflict.beersEntry ? beersShortCourseNote(ctx.context, true, conflict.beersEntry) : null,
    ]),
    origin: "condition.contraindication",
    medications: [med.generic],
    reviewQuestions: [`Was the prescriber aware of the patient's ${conflict.condition}?`, "Is there a safer alternative or a monitoring plan?"],
    referenceIds: conflict.referenceIds,
    excludedSections: excludedSectionsFor(ctx.context),
    retrievalQuery: `${med.generic} ${conflict.condition} contraindication`,
    therapyContext: ctx,
  });
}
