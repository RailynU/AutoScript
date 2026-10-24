import type { EnteredScriptData, ExtractedPrescription } from "@autoscript/shared";

function firstInt(value: string | null): number | null {
  const m = value?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const us = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return us ? `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : null;
}

/** Map an engine extraction onto the AutoScript intake form fields (first medication line). Unknown → null, never guessed. */
export function toScriptData(x: ExtractedPrescription): EnteredScriptData {
  const [first, ...rest] = (x.patientName ?? "").trim().split(/\s+/).filter(Boolean);
  const med = x.medications[0] ?? null;
  const npi = (x.prescriberIdentifier ?? "").replace(/\D/g, "");
  const days = med?.duration && /day/i.test(med.duration) ? firstInt(med.duration) : null;
  return {
    patientFirstName: first ?? null,
    patientLastName: rest.length ? rest.join(" ") : null,
    patientDateOfBirth: isoDate(x.patientDateOfBirth),
    drugName: med ? [med.rawName, med.strength && !med.rawName.includes(med.strength) ? med.strength : null].filter(Boolean).join(" ") : null,
    directions: med?.sig ?? med?.frequency ?? null,
    quantity: med ? firstInt(med.quantity) : null,
    daySupply: days,
    refillCount: med ? firstInt(med.refills) : null,
    prescriberName: x.prescriberName,
    prescriberNpi: npi.length === 10 ? npi : null,
    prescriberPhone: null,
  };
}
