import type { ExtractedMedication, TherapyContext } from "@autoscript/shared";
import { parseDosesPerDay, parseUnitsPerDose } from "./dose";

/**
 * Pure classifier: is the prescribed exposure a short course or ongoing therapy?
 * Reads only what is written on the prescription (duration, quantity, frequency,
 * refills, PRN wording). Returns UNKNOWN rather than guessing.
 */
export type TherapyContextMedication = Pick<ExtractedMedication, "sig" | "frequency" | "quantity" | "refills" | "duration">;

export interface TherapyContextResult {
  context: TherapyContext;
  /** What was parsed and how the conclusion follows, for the finding explanation and the AI prompt. */
  basis: string;
  /** Days of exposure covered by the prescription as written, multiplied by (refills + 1) when refills are stated. */
  totalDays: number | null;
  asNeeded: boolean;
}

/** A course that ends within this many days (including stated refills) is a short course. */
export const ACUTE_MAX_DAYS = 14;
/** Exposure of at least this many days (including stated refills), or any refill with unknown length, is ongoing therapy. */
export const CHRONIC_MIN_DAYS = 30;

const UNIT_DAYS: Array<[RegExp, number]> = [
  [/^(d|day|days)$/i, 1],
  [/^(wk|wks|week|weeks)$/i, 7],
  [/^(mo|mos|month|months)$/i, 30],
];

const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(days?|wks?|weeks?|mos?|months?|d)\b/i;
const PRN_PATTERN = /\bprn\b|\bas needed\b|\bas required\b|\bwhen necessary\b/i;
/** Volumes and weights are not countable units; days of supply cannot be derived from them. */
const NON_COUNTABLE_QUANTITY = /\b(ml|mls|milliliters?|l|liters?|oz|g|grams?|kg)\b/i;

export function parseDurationDays(text: string | null): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(DURATION_PATTERN);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2]!;
  const factor = UNIT_DAYS.find(([pattern]) => pattern.test(unit))?.[1];
  return factor == null ? null : value * factor;
}

export function parseRefills(text: string | null): number | null {
  if (!text) return null;
  if (/\b(none|no refills?|nr|zero)\b/i.test(text)) return 0;
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Countable units dispensed (tablets, capsules), or null for volumes, weights and unparseable text. */
export function parseQuantityUnits(text: string | null): number | null {
  if (!text) return null;
  if (NON_COUNTABLE_QUANTITY.test(text.replace(/\bmg\b/gi, ""))) return null;
  const m = text.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function formatDays(days: number): string {
  const rounded = Number.isInteger(days) ? String(days) : days.toFixed(1);
  return `${rounded} day${days === 1 ? "" : "s"}`;
}

export function classifyTherapyContext(med: TherapyContextMedication): TherapyContextResult {
  const parts: string[] = [];
  const asNeeded = PRN_PATTERN.test(med.sig ?? "") || PRN_PATTERN.test(med.frequency ?? "");

  const explicitDays = parseDurationDays(med.duration) ?? parseDurationDays(med.sig);
  let courseDays: number | null = explicitDays;
  if (explicitDays != null) {
    parts.push(`stated duration ${formatDays(explicitDays)}`);
  } else {
    const units = parseQuantityUnits(med.quantity);
    const dosesPerDay = parseDosesPerDay(med.frequency) ?? parseDosesPerDay(med.sig);
    if (units != null && dosesPerDay != null) {
      const unitsPerDose = parseUnitsPerDose(med.sig);
      courseDays = units / (unitsPerDose * dosesPerDay);
      parts.push(`quantity ${units} at ${unitsPerDose} x ${dosesPerDay} doses/day = ${formatDays(courseDays)} of supply${asNeeded ? " at most-frequent use" : ""}`);
    } else {
      parts.push(med.quantity ? `quantity "${med.quantity}" and frequency do not give days of supply` : "no duration or quantity stated");
    }
  }

  const refills = parseRefills(med.refills);
  parts.push(refills == null ? "refills not stated" : `${refills} refill${refills === 1 ? "" : "s"}`);
  if (asNeeded) parts.push("as needed (PRN)");

  const totalDays = courseDays == null ? null : courseDays * ((refills ?? 0) + 1);
  if (totalDays != null && refills != null && refills > 0) parts.push(`${formatDays(totalDays)} including refills`);

  const basisPrefix = parts.join("; ");
  if (totalDays != null && totalDays <= ACUTE_MAX_DAYS) {
    return { context: "ACUTE_SHORT_COURSE", basis: `${basisPrefix}: short course (${ACUTE_MAX_DAYS} days or less)`, totalDays, asNeeded };
  }
  if (totalDays != null && totalDays >= CHRONIC_MIN_DAYS) {
    return { context: "CHRONIC", basis: `${basisPrefix}: ongoing therapy (${CHRONIC_MIN_DAYS} days or more)`, totalDays, asNeeded };
  }
  if (totalDays != null) {
    return { context: "UNKNOWN", basis: `${basisPrefix}: between ${ACUTE_MAX_DAYS} and ${CHRONIC_MIN_DAYS} days, neither clearly short-course nor ongoing`, totalDays, asNeeded };
  }
  if (refills != null && refills > 0) {
    return { context: "CHRONIC", basis: `${basisPrefix}: refills indicate ongoing therapy`, totalDays, asNeeded };
  }
  return { context: "UNKNOWN", basis: `${basisPrefix}: duration could not be determined`, totalDays, asNeeded };
}

/**
 * Context for a finding about several prescribed medications. The overlap window is bounded by the
 * shortest course, so any short course makes the combination short-course; otherwise any ongoing
 * medication makes it ongoing.
 */
export function combineTherapyContexts(items: Array<{ label: string; result: TherapyContextResult }>): TherapyContextResult {
  if (items.length === 0) {
    return { context: "UNKNOWN", basis: "no prescribed medication line to classify", totalDays: null, asNeeded: false };
  }
  if (items.length === 1) return items[0]!.result;
  const basis = items.map((i) => `${i.label}: ${i.result.basis}`).join(" | ");
  const asNeeded = items.every((i) => i.result.asNeeded);
  const acute = items.find((i) => i.result.context === "ACUTE_SHORT_COURSE");
  if (acute) return { context: "ACUTE_SHORT_COURSE", basis, totalDays: acute.result.totalDays, asNeeded };
  const chronic = items.find((i) => i.result.context === "CHRONIC");
  if (chronic) return { context: "CHRONIC", basis, totalDays: chronic.result.totalDays, asNeeded };
  return { context: "UNKNOWN", basis, totalDays: null, asNeeded };
}
