import type { EnteredScriptData, ExtractedMedication, Severity } from "@autoscript/shared";
import { normalizeDrugName } from "../drugs";
import type { Rule, RuleFinding } from "../types";
import { finding } from "./helpers";

const REFERENCE_IDS = ["cfr-1306-05-prescription-requirements"];

function text(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

function digits(value: string | null | undefined): string | null {
  const d = (value ?? "").replace(/\D/g, "");
  return d === "" ? null : d;
}

function firstInt(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const m = value.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** "1985-04-12", "04/12/1985" or "4/12/85"-style dates → yyyy-MM-dd; null when unparseable. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (us) {
    const year = us[3]!.length === 2 ? `19${us[3]}` : us[3]!;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  return null;
}

/** Numeric strengths written in a string, e.g. "Lisinopril 10 mg" → ["10"]. */
function strengths(value: string | null | undefined): string[] {
  return [...(value ?? "").matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|iu|%)/gi)].map((m) => String(Number(m[1])));
}

/** Prescriber names: drop titles/credentials, compare remaining words. */
function personTokens(value: string | null | undefined): Set<string> {
  const t = text(value) ?? "";
  return new Set(t.split(" ").filter((w) => w.length > 1 && !["dr", "md", "do", "np", "pa", "rph", "dds", "phd"].includes(w)));
}

/** Pick the extracted line the technician most likely typed (same generic first, else the first line). */
function matchLine(meds: ExtractedMedication[], drugName: string | null | undefined): ExtractedMedication | null {
  if (meds.length === 0) return null;
  const generic = drugName ? normalizeDrugName(drugName).generic : null;
  return meds.find((m) => generic && (m.normalizedName ?? normalizeDrugName(m.rawName).generic) === generic) ?? meds[0]!;
}

interface Mismatch {
  field: string;
  label: string;
  entered: string;
  onScript: string;
  severity: Severity;
  why: string;
}

function toFinding(m: Mismatch, medications: string[]): RuleFinding {
  return finding({
    type: "DATA_ENTRY_MISMATCH",
    severity: m.severity,
    title: `Entered ${m.label} does not match the script`,
    explanation: `The ${m.label} typed at intake ("${m.entered}") differs from the ${m.label} read on the prescription ("${m.onScript}"). ${m.why}`,
    origin: `entry.verify/${m.field}`,
    medications,
    reviewQuestions: [`Re-check the ${m.label} against the original prescription and correct the entry before filling.`],
    referenceIds: REFERENCE_IDS,
    retrievalQuery: "prescription data entry verification pharmacist accuracy",
  });
}

export const entryVerificationRule: Rule = {
  id: "entry.verify",
  description: "Compares the technician's manual entry with the fields read on the script and flags every mismatch (AutoScript data-entry check).",
  run({ extraction, entered }) {
    if (!entered) return [];
    const out: Mismatch[] = [];

    const enteredName = [entered.patientFirstName, entered.patientLastName].filter(Boolean).join(" ");
    if (text(enteredName) && text(extraction.patientName)) {
      const scriptTokens = personTokens(extraction.patientName);
      const missing = [...personTokens(enteredName)].filter((w) => !scriptTokens.has(w));
      if (missing.length > 0) {
        out.push({ field: "patientName", label: "patient name", entered: enteredName, onScript: extraction.patientName!, severity: "HIGH", why: "The script may belong to a different patient." });
      }
    }

    const enteredDob = toIsoDate(entered.patientDateOfBirth);
    const scriptDob = toIsoDate(extraction.patientDateOfBirth);
    if (enteredDob && scriptDob && enteredDob !== scriptDob) {
      out.push({ field: "patientDateOfBirth", label: "date of birth", entered: enteredDob, onScript: scriptDob, severity: "HIGH", why: "A date-of-birth mismatch suggests the wrong patient profile." });
    }

    const line = matchLine(extraction.medications, entered.drugName);
    const medLabel = line ? [line.normalizedName ?? line.rawName] : [];
    if (line && text(entered.drugName)) {
      const enteredGeneric = normalizeDrugName(entered.drugName!).generic;
      const scriptGeneric = line.normalizedName ?? normalizeDrugName(line.rawName).generic;
      const scriptDrug = [line.rawName, line.strength].filter(Boolean).join(" ");
      if (enteredGeneric && scriptGeneric && enteredGeneric !== scriptGeneric) {
        out.push({ field: "drugName", label: "drug", entered: entered.drugName!, onScript: scriptDrug, severity: "CRITICAL", why: "Dispensing as entered would give the patient a different drug." });
      } else {
        const typed = strengths(entered.drugName);
        const written = strengths(scriptDrug);
        if (typed.length > 0 && written.length > 0 && !typed.some((s) => written.includes(s))) {
          out.push({ field: "drugStrength", label: "drug strength", entered: entered.drugName!, onScript: scriptDrug, severity: "HIGH", why: "A strength mismatch is a dosing error." });
        }
      }
    }

    if (line) {
      const qty = firstInt(entered.quantity);
      const scriptQty = firstInt(line.quantity);
      if (qty != null && scriptQty != null && qty !== scriptQty) {
        out.push({ field: "quantity", label: "quantity", entered: String(qty), onScript: line.quantity!, severity: "HIGH", why: "The dispensed amount would differ from what was prescribed." });
      }
      const refills = firstInt(entered.refillCount);
      const scriptRefills = firstInt(line.refills);
      if (refills != null && scriptRefills != null && refills !== scriptRefills) {
        out.push({ field: "refillCount", label: "refill count", entered: String(refills), onScript: line.refills!, severity: "MODERATE", why: "Refills authorized must match the prescription." });
      }
      const supply = firstInt(entered.daySupply);
      const scriptDays = line.duration && /day/i.test(line.duration) ? firstInt(line.duration) : null;
      if (supply != null && scriptDays != null && supply !== scriptDays) {
        out.push({ field: "daySupply", label: "day supply", entered: String(supply), onScript: line.duration!, severity: "MODERATE", why: "Day supply drives refill timing and insurance billing." });
      }
      const sig = line.sig ?? line.frequency;
      if (text(entered.directions) && text(sig) && text(entered.directions) !== text(sig)) {
        const typedNums = (entered.directions!.match(/\d+/g) ?? []).join(",");
        const scriptNums = (sig!.match(/\d+/g) ?? []).join(",");
        out.push({
          field: "directions",
          label: "directions",
          entered: entered.directions!,
          onScript: sig!,
          severity: typedNums !== scriptNums ? "HIGH" : "LOW",
          why: typedNums !== scriptNums ? "The numbers in the directions differ, which changes the dose or frequency." : "The wording differs; confirm the label matches the prescriber's intent.",
        });
      }
    }

    if (text(entered.prescriberName) && text(extraction.prescriberName)) {
      const scriptTokens = personTokens(extraction.prescriberName);
      const missing = [...personTokens(entered.prescriberName)].filter((w) => !scriptTokens.has(w));
      if (missing.length > 0) {
        out.push({ field: "prescriberName", label: "prescriber name", entered: entered.prescriberName!, onScript: extraction.prescriberName!, severity: "MODERATE", why: "The prescription must be attributed to the prescriber who wrote it." });
      }
    }

    const npi = digits(entered.prescriberNpi);
    const scriptId = digits(extraction.prescriberIdentifier);
    if (npi && scriptId && !scriptId.includes(npi)) {
      out.push({ field: "prescriberNpi", label: "prescriber NPI", entered: entered.prescriberNpi!, onScript: extraction.prescriberIdentifier!, severity: "MODERATE", why: "Claims and controlled-substance checks rely on the correct prescriber identifier." });
    }

    return out.map((m) => toFinding(m, m.field.startsWith("patient") || m.field.startsWith("prescriber") ? [] : medLabel));
  },
};
