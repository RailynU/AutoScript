import type { CreatePatient } from "@/lib/shared";

/** Free-text patient form used by the intake dialog and the Patients page. */
export interface PatientFormValues {
  firstName: string;
  lastName: string;
  /** MM/DD/YYYY (ISO also accepted). */
  dob: string;
  phone: string;
  /** Comma/semicolon/newline separated; "Penicillin (hives)" keeps the reaction. */
  allergies: string;
  /** No known drug allergies, confirmed with the patient. */
  nkda: boolean;
  medications: string;
  conditions: string;
}

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  dob: "",
  phone: "",
  allergies: "",
  nkda: false,
  medications: "",
  conditions: "",
};

/** ISO yyyy-MM-dd → MM/DD/YYYY for display; the input unchanged when it is not ISO. */
export function formatDob(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso ?? "—");
}

/** MM/DD/YYYY (or ISO) → ISO yyyy-MM-dd; null when unparseable or not a real date. */
export function toIsoDob(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const s = dob.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = iso ? [iso[1]!, iso[2]!, iso[3]!] : us ? [us[3]!, us[1]!.padStart(2, "0"), us[2]!.padStart(2, "0")] : null;
  if (!parts) return null;
  const [y, mo, d] = parts as [string, string, string];
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== Number(mo) || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** "Penicillin (rash), Sulfa" → ["Penicillin (rash)", "Sulfa"]. */
export function parseList(text: string): string[] {
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Form → POST /api/patients body, or a human error message.
 * NKDA is stored as an "NKDA" allergy entry and counts as a verified allergy history;
 * so does any typed allergy. An empty allergy field stays unverified.
 */
export function toCreatePatient(f: PatientFormValues): CreatePatient | string {
  if (!f.firstName.trim() || !f.lastName.trim()) return "First and last name are required.";
  const dateOfBirth = toIsoDob(f.dob);
  if (!dateOfBirth) return "Date of birth must be a real date in MM/DD/YYYY format.";
  const allergies = f.nkda
    ? [{ substance: "NKDA", reaction: null, severity: "UNKNOWN" as const }]
    : parseList(f.allergies).map((a) => {
        const m = a.match(/^(.*?)\s*\((.*)\)\s*$/);
        return {
          substance: (m ? m[1]! : a).trim(),
          reaction: m ? m[2]!.trim() : null,
          severity: /anaphyla|severe/i.test(a) ? ("SEVERE" as const) : ("UNKNOWN" as const),
        };
      });
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    dateOfBirth,
    phone: normalizePhone(f.phone) || null,
    allergiesVerified: f.nkda || allergies.length > 0,
    allergies,
    conditions: parseList(f.conditions).map((name) => ({ name, status: "ACTIVE" as const })),
    medications: parseList(f.medications).map((name) => ({ name, active: true })),
  };
}
