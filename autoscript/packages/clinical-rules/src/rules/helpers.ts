import type { ExtractedMedication } from "@autoscript/shared";
import { classesOf, normalizeDrugName, type DrugClass } from "../drugs";
import { classifyTherapyContext, combineTherapyContexts, type TherapyContextResult } from "../therapyContext";
import type { RuleFinding } from "../types";

export interface ResolvedMed {
  label: string;
  generic: string;
  classes: DrugClass[];
  source: "PRESCRIPTION" | "PATIENT_RECORD";
  med: ExtractedMedication | null;
}

let counter = 0;
export function findingId(ruleId: string): string {
  counter += 1;
  return `${ruleId}-${counter.toString(36)}`;
}

export function resolvePrescribed(meds: ExtractedMedication[]): {
  resolved: ResolvedMed[];
  unresolved: ExtractedMedication[];
} {
  const resolved: ResolvedMed[] = [];
  const unresolved: ExtractedMedication[] = [];
  for (const med of meds) {
    const generic = med.normalizedName ?? normalizeDrugName(med.rawName).generic;
    if (!generic) {
      unresolved.push(med);
      continue;
    }
    resolved.push({ label: med.rawName, generic, classes: classesOf(generic), source: "PRESCRIPTION", med });
  }
  return { resolved, unresolved };
}

export function resolvePatientMeds(
  meds: Array<{ name: string; genericName?: string | null; active: boolean }>,
): ResolvedMed[] {
  const out: ResolvedMed[] = [];
  for (const m of meds) {
    if (!m.active) continue;
    const generic = m.genericName ?? normalizeDrugName(m.name).generic;
    if (!generic) continue;
    out.push({ label: m.name, generic, classes: classesOf(generic), source: "PATIENT_RECORD", med: null });
  }
  return out;
}

export function describe(med: ResolvedMed): string {
  return med.source === "PATIENT_RECORD"
    ? `${med.label} (active medication on patient record)`
    : `${med.label} (on this prescription)`;
}

/**
 * Therapy context of the prescribed line(s) among `meds`. Patient-record medications carry no
 * quantity or duration and are not classified; the new prescription bounds the overlap window.
 */
export function therapyContextFor(meds: ResolvedMed[]): TherapyContextResult {
  const prescribed = meds.filter((m): m is ResolvedMed & { med: ExtractedMedication } => m.source === "PRESCRIPTION" && m.med != null);
  return combineTherapyContexts(prescribed.map((m) => ({ label: m.label, result: classifyTherapyContext(m.med) })));
}

type TraceabilityKey = "severitySource" | "supportStatus" | "proposedSeverity" | "therapyContext" | "therapyContextBasis";

export type FindingSeed = Omit<RuleFinding, "id" | "deterministic" | TraceabilityKey> & {
  /** Omit for findings that are not about a prescribed medication's duration (recorded as UNKNOWN). */
  therapyContext?: TherapyContextResult;
};

/** Every rule finding is deterministic, takes its severity from the rule table, and records its therapy context. */
export function finding(seed: FindingSeed): RuleFinding {
  const { therapyContext, ...rest } = seed;
  return {
    ...rest,
    id: findingId(seed.origin),
    deterministic: true,
    severitySource: "RULE_TABLE",
    supportStatus: null,
    proposedSeverity: null,
    therapyContext: therapyContext?.context ?? "UNKNOWN",
    therapyContextBasis: therapyContext?.basis ?? null,
  };
}
