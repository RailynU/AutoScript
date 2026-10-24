import type { EnteredScriptData, ExtractedMedication, ExtractedPrescription, Finding, PatientSummary } from "@/lib/shared";

/**
 * AutoScript data-entry check, client side. The engine's `entry.verify` rule decides what is a
 * mismatch (DATA_ENTRY_MISMATCH findings); this module only lays the technician's entry next to
 * what was read on the script and attaches each finding to its row. It never re-judges a field.
 */

export type EntryField =
  | "patientName"
  | "patientDateOfBirth"
  | "drugName"
  | "directions"
  | "quantity"
  | "daySupply"
  | "refillCount"
  | "prescriberName"
  | "prescriberNpi";

export const ENTRY_FIELD_LABEL: Record<EntryField, string> = {
  patientName: "Patient name",
  patientDateOfBirth: "Date of birth",
  drugName: "Drug & strength",
  directions: "Directions",
  quantity: "Quantity",
  daySupply: "Day supply",
  refillCount: "Refills",
  prescriberName: "Prescriber",
  prescriberNpi: "Prescriber NPI",
};

const FIELD_ORDER = Object.keys(ENTRY_FIELD_LABEL) as EntryField[];

/** `entry.verify/drugStrength` reports against the drug row. */
const ORIGIN_FIELD: Record<string, EntryField> = { drugStrength: "drugName" };

export interface EntryRow {
  field: EntryField;
  label: string;
  entered: string | null;
  onScript: string | null;
  /** DATA_ENTRY_MISMATCH findings the engine raised for this field. */
  mismatches: Finding[];
}

export function isEntryMismatch(f: Pick<Finding, "type">): boolean {
  return f.type === "DATA_ENTRY_MISMATCH";
}

/** Field a DATA_ENTRY_MISMATCH finding is about, read from its origin ("entry.verify/<field>"). */
export function entryFieldOf(f: Pick<Finding, "origin">): EntryField | null {
  const m = /^entry\.verify\/(\w+)$/.exec(f.origin);
  if (!m) return null;
  const raw = m[1]!;
  const field = ORIGIN_FIELD[raw] ?? raw;
  return (FIELD_ORDER as string[]).includes(field) ? (field as EntryField) : null;
}

function str(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** The medication line the entry most likely refers to: one whose name appears in the typed drug, else the first. */
export function matchLine(meds: readonly ExtractedMedication[], drugName: string | null | undefined): ExtractedMedication | null {
  if (meds.length === 0) return null;
  const typed = (drugName ?? "").toLowerCase();
  const hit = typed
    ? meds.find((m) => [m.rawName, m.normalizedName].some((n) => n && typed.includes(n.toLowerCase().split(" ")[0]!)))
    : undefined;
  return hit ?? meds[0]!;
}

export function buildEntryRows(entered: EnteredScriptData, extraction: ExtractedPrescription | null, findings: readonly Finding[]): EntryRow[] {
  const line = extraction ? matchLine(extraction.medications, entered.drugName) : null;
  const enteredValues: Record<EntryField, string | null> = {
    patientName: str([entered.patientFirstName, entered.patientLastName].filter(Boolean).join(" ")),
    patientDateOfBirth: str(entered.patientDateOfBirth),
    drugName: str(entered.drugName),
    directions: str(entered.directions),
    quantity: str(entered.quantity),
    daySupply: str(entered.daySupply),
    refillCount: str(entered.refillCount),
    prescriberName: str(entered.prescriberName),
    prescriberNpi: str(entered.prescriberNpi),
  };
  const scriptValues: Record<EntryField, string | null> = {
    patientName: str(extraction?.patientName),
    patientDateOfBirth: str(extraction?.patientDateOfBirth),
    drugName: line ? str([line.rawName, line.strength].filter(Boolean).join(" ")) : null,
    directions: str(line?.sig ?? line?.frequency),
    quantity: str(line?.quantity),
    daySupply: str(line?.duration),
    refillCount: str(line?.refills),
    prescriberName: str(extraction?.prescriberName),
    prescriberNpi: str(extraction?.prescriberIdentifier),
  };
  const byField = new Map<EntryField, Finding[]>();
  for (const f of findings) {
    if (!isEntryMismatch(f)) continue;
    const field = entryFieldOf(f);
    if (field) byField.set(field, [...(byField.get(field) ?? []), f]);
  }
  return FIELD_ORDER.map((field) => ({
    field,
    label: ENTRY_FIELD_LABEL[field],
    entered: enteredValues[field],
    onScript: scriptValues[field],
    mismatches: byField.get(field) ?? [],
  }));
}

// ── Intake manual-entry form ────────────────────────────────────────────────

export interface EntryFormValues {
  drugName: string;
  directions: string;
  quantity: string;
  daySupply: string;
  refills: string;
  prescriberName: string;
  npi: string;
}

export const EMPTY_ENTRY_FORM: EntryFormValues = { drugName: "", directions: "", quantity: "", daySupply: "", refills: "", prescriberName: "", npi: "" };

/** First validation problem with the typed entry (limits match the API's EnteredScriptData schema), or null. */
export function entryFormError(f: EntryFormValues): string | null {
  const between = (s: string, lo: number, hi: number) => Number.isInteger(Number(s)) && Number(s) >= lo && Number(s) <= hi;
  if (f.drugName.length > 200) return "Drug name must be 200 characters or fewer.";
  if (f.directions.length > 500) return "Directions must be 500 characters or fewer.";
  if (f.prescriberName.length > 100) return "Prescriber name must be 100 characters or fewer.";
  if (f.quantity.trim() && !between(f.quantity.trim(), 1, 9999)) return "Quantity must be a whole number from 1 to 9999.";
  if (f.daySupply.trim() && !between(f.daySupply.trim(), 1, 365)) return "Day supply must be a whole number from 1 to 365.";
  if (f.refills.trim() && !between(f.refills.trim(), 0, 99)) return "Refills must be a whole number from 0 to 99.";
  if (f.npi.trim() && !/^\d{10}$/.test(f.npi.replace(/\D/g, ""))) return "NPI must be exactly 10 digits.";
  return null;
}

/** Drug, directions and quantity are required for the entry check; everything else is optional. */
export function entryFormComplete(f: EntryFormValues): boolean {
  return f.drugName.trim() !== "" && f.directions.trim() !== "" && f.quantity.trim() !== "" && entryFormError(f) === null;
}

const num = (s: string): number | null => (s.trim() && !Number.isNaN(Number(s)) ? Number(s) : null);

/** Form + selected patient → the `enteredData` sent with the upload. */
export function toEnteredData(f: EntryFormValues, patient: PatientSummary | null): EnteredScriptData {
  return {
    patientFirstName: patient?.firstName ?? null,
    patientLastName: patient?.lastName ?? null,
    patientDateOfBirth: patient?.dateOfBirth ?? null,
    drugName: f.drugName.trim() || null,
    directions: f.directions.trim() || null,
    quantity: num(f.quantity),
    daySupply: num(f.daySupply),
    refillCount: num(f.refills),
    prescriberName: f.prescriberName.trim() || null,
    prescriberNpi: f.npi.replace(/\D/g, "") || null,
    prescriberPhone: null,
  };
}

/** Autofill: only overwrite a field when the extractor returned a value for it. */
export function applyAutofill(f: EntryFormValues, data: EnteredScriptData): EntryFormValues {
  return {
    drugName: data.drugName ?? f.drugName,
    directions: data.directions ?? f.directions,
    quantity: data.quantity != null ? String(data.quantity) : f.quantity,
    daySupply: data.daySupply != null ? String(data.daySupply) : f.daySupply,
    refills: data.refillCount != null ? String(data.refillCount) : f.refills,
    prescriberName: data.prescriberName ?? f.prescriberName,
    npi: data.prescriberNpi ?? f.npi,
  };
}
