/**
 * Minimal daily-dose calculator used by the dose rule. Returns null whenever
 * the strength or frequency cannot be parsed with confidence; the rule then
 * records a limitation instead of guessing.
 */
export interface ParsedDose {
  mgPerUnit: number;
  unitsPerDose: number;
  dosesPerDay: number;
  mgPerDay: number;
}

const FREQUENCY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(once|one time|1x)\s*(a|per)?\s*(day|daily)\b|\bqd\b|\bq\.?d\.?\b|\bdaily\b|\bevery day\b|\bqam\b|\bqhs\b|\bat bedtime\b/i, 1],
  [/\btwice\s*(a|per)?\s*(day|daily)\b|\bbid\b|\bb\.i\.d\.?\b|\bq\s?12\s?h(ours?)?\b|\bevery\s*12\s*hours?\b|\b2x\s*(a|per)?\s*day\b/i, 2],
  [/\bthree times\s*(a|per)?\s*(day|daily)\b|\btid\b|\bt\.i\.d\.?\b|\bq\s?8\s?h(ours?)?\b|\bevery\s*8\s*hours?\b|\b3x\s*(a|per)?\s*day\b/i, 3],
  [/\bfour times\s*(a|per)?\s*(day|daily)\b|\bqid\b|\bq\.i\.d\.?\b|\bq\s?6\s?h(ours?)?\b|\bevery\s*6\s*hours?\b|\b4x\s*(a|per)?\s*day\b/i, 4],
  [/\bq\s?4\s?h(ours?)?\b|\bevery\s*4\s*hours?\b/i, 6],
];

export function parseStrengthMg(strength: string | null): number | null {
  if (!strength) return null;
  const m = strength.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg)\b/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit === "g") return value * 1000;
  if (unit === "mcg") return value / 1000;
  return value;
}

/**
 * Most frequent pattern first: "twice daily" and "three times daily" also contain the
 * once-daily token "daily", so the more specific (higher) frequency has to win.
 */
const FREQUENCY_PATTERNS_MOST_FREQUENT_FIRST = [...FREQUENCY_PATTERNS].sort((a, b) => b[1] - a[1]);

export function parseDosesPerDay(text: string | null): number | null {
  if (!text) return null;
  for (const [pattern, perDay] of FREQUENCY_PATTERNS_MOST_FREQUENT_FIRST) {
    if (pattern.test(text)) return perDay;
  }
  return null;
}

export function parseUnitsPerDose(sig: string | null): number {
  if (!sig) return 1;
  const m = sig.match(/\b(?:take|give)?\s*(\d+|one|two|three|four)\s*(tablets?|tabs?|capsules?|caps?)\b/i);
  if (!m) return 1;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  const token = m[1]!.toLowerCase();
  return words[token] ?? Number(token);
}

export function computeDailyDose(
  strength: string | null,
  sig: string | null,
  frequency: string | null,
): ParsedDose | null {
  const mgPerUnit = parseStrengthMg(strength);
  const dosesPerDay = parseDosesPerDay(frequency) ?? parseDosesPerDay(sig);
  if (mgPerUnit == null || dosesPerDay == null) return null;
  const unitsPerDose = parseUnitsPerDose(sig);
  return { mgPerUnit, unitsPerDose, dosesPerDay, mgPerDay: mgPerUnit * unitsPerDose * dosesPerDay };
}

/** Maximum recommended daily doses for the demo rule, in mg. */
export const MAX_DAILY_DOSE_MG: Record<string, { maxMg: number; referenceIds: string[]; note: string }> = {
  acetaminophen: {
    maxMg: 4000,
    referenceIds: ["fda-acetaminophen-max-dose"],
    note: "Labeled maximum for adults is 4 g/day; many clinicians use 3 g/day in older adults or hepatic risk.",
  },
  ibuprofen: {
    maxMg: 3200,
    referenceIds: ["fda-ibuprofen-label-anticoagulants"],
    note: "Prescription labeling caps ibuprofen at 3,200 mg/day; OTC labeling caps it at 1,200 mg/day.",
  },
};
