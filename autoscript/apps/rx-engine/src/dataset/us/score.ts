import { cleanDrugName, parseDosesPerDay, parseStrengthMg } from "@autoscript/clinical-rules";
import type { ExtractedPrescription } from "@autoscript/shared";
import type { ExtractionScore, GroundTruth } from "./schema.js";

const norm = (s: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const digits = (s: string | null): string => (s ?? "").replace(/\D+/g, "");

/** Accepts ISO, MM/DD/YYYY or M-D-YY and compares year/month/day. */
function sameDate(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const key = (s: string): string | null => {
    const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${Number(iso[2])}-${Number(iso[3])}`;
    const us = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (us) return `${us[3]!.length === 2 ? `20${us[3]}` : us[3]}-${Number(us[1])}-${Number(us[2])}`;
    return null;
  };
  return key(a) != null && key(a) === key(b);
}

function nameMatches(expected: string, got: string | null): boolean {
  if (!got) return false;
  const e = norm(expected).split(" ").filter((w) => w.length > 2 && !["dr", "md", "do", "pa", "c"].includes(w));
  const g = norm(got);
  return e.length > 0 && e.every((w) => g.includes(w));
}

/** Field-level comparison of a model transcription against the rendered ground truth. */
export function scoreExtraction(gt: GroundTruth, x: ExtractedPrescription): ExtractionScore {
  const patientName = nameMatches(`${gt.patient.firstName} ${gt.patient.lastName}`, x.patientName);
  const prescriberName = gt.prescriber.name ? nameMatches(gt.prescriber.name, x.prescriberName) : x.prescriberName == null;
  const dateWritten = sameDate(gt.dateWritten, x.dateWritten);

  const remaining = [...x.medications];
  let matched = 0;
  let strength = 0;
  let frequency = 0;
  let quantity = 0;
  for (const m of gt.medications) {
    const key = cleanDrugName(m.writtenName);
    const idx = remaining.findIndex((r) => (m.generic && r.normalizedName === m.generic) || cleanDrugName(r.rawName) === key);
    if (idx < 0) continue;
    const [r] = remaining.splice(idx, 1);
    matched++;
    if (parseStrengthMg(r!.strength) === parseStrengthMg(m.strength)) strength++;
    if ((parseDosesPerDay(r!.frequency) ?? parseDosesPerDay(r!.sig)) === parseDosesPerDay(m.sig)) frequency++;
    if (digits(r!.quantity) === digits(m.quantity)) quantity++;
  }
  const compared = 3 + gt.medications.length * 4;
  const hits = Number(patientName) + Number(prescriberName) + Number(dateWritten) + matched + strength + frequency + quantity;
  return {
    patientName,
    prescriberName,
    dateWritten,
    medicationsExpected: gt.medications.length,
    medicationsFound: x.medications.length,
    medicationsMatched: matched,
    strengthMatched: strength,
    frequencyMatched: frequency,
    quantityMatched: quantity,
    overall: compared === 0 ? 1 : Math.round((hits / compared) * 1000) / 1000,
  };
}
