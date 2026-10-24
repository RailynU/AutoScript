import type { PatientContext } from "@autoscript/shared";

const MAX_PLAUSIBLE_AGE = 130;

/** The date the prescription was written when parseable, otherwise now; the anchor for age calculations. */
export function prescriptionDate(dateWritten: string | null): Date {
  const parsed = dateWritten ? new Date(dateWritten) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

/** Whole calendar years from `from` to `to` (UTC), negative when `to` precedes `from`. */
export function wholeYearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeAnniversary = to.getUTCMonth() < from.getUTCMonth() || (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

/** Whole years from an ISO date string to `asOf`; null when the string is missing or unparseable. */
export function yearsSince(isoDate: string | null | undefined, asOf: Date): number | null {
  if (!isoDate) return null;
  const from = new Date(isoDate);
  return Number.isNaN(from.getTime()) ? null : wholeYearsBetween(from, asOf);
}

/** Whole years between the patient's date of birth and `asOf`; null when the DOB is missing or unparseable. */
export function patientAgeYears(patient: Pick<PatientContext, "dateOfBirth"> | null, asOf: Date = new Date()): number | null {
  const age = yearsSince(patient?.dateOfBirth, asOf);
  return age != null && age >= 0 && age < MAX_PLAUSIBLE_AGE ? age : null;
}
