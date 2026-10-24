import type { PatientContext } from "@autoscript/shared";
import type { DatasetEntry } from "../dataset/schema.js";
import type { UsDatasetEntry } from "../dataset/us/schema.js";

export type ExampleDataset = "us-synthetic" | "prescriptions";

/** One labelled case ready to be stored in case_examples. `summary` is the only text that gets embedded. */
export interface CaseExampleInput {
  id: string;
  dataset: ExampleDataset;
  scenario: string | null;
  verdict: "good" | "bad";
  reasons: string[];
  summary: string;
  payload: Record<string, unknown>;
}

const DATE_PATTERN = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{4}\b|\(\d{3}\)\s?\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;
const MIN_NAME_TOKEN = 3;

/** Name tokens (length >= 3) from free-text names, so "Dr. R.Keshwani" scrubs "Keshwani" but not "Dr". */
function nameTokens(names: Array<string | null | undefined>): string[] {
  return names
    .flatMap((n) => (n ?? "").split(/[^A-Za-z'-]+/))
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= MIN_NAME_TOKEN);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove personal identifiers from free text: name tokens, dates, phone-like numbers. Pure. */
export function scrubIdentifiers(text: string, names: Array<string | null | undefined>): string {
  let out = text.replace(DATE_PATTERN, "[date]").replace(PHONE_PATTERN, "[phone]");
  for (const token of new Set(nameTokens(names))) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi"), "[name]");
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter((s) => s.length > 0))];
}

function patientContextLines(p: PatientContext): string[] {
  const active = p.medications.filter((m) => m.active);
  return [
    `Patient: sex ${p.sex ?? "unknown"}; weight ${p.weightKg ?? "unknown"} kg`,
    `Allergies (${p.allergiesVerified ? "verified" : "unverified"}): ${p.allergies.length ? p.allergies.map((a) => `${a.substance} [${a.severity}${a.reaction ? `; ${a.reaction}` : ""}]`).join("; ") : "none recorded"}`,
    `Conditions: ${p.conditions.length ? p.conditions.map((c) => `${c.name} (${c.status})`).join("; ") : "none recorded"}`,
    `Active medications: ${active.length ? active.map((m) => `${m.genericName ?? m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` ${m.frequency}` : ""}`).join("; ") : "none"}`,
  ];
}

/** Map a US synthetic entry to an example. Names, addresses, phones, NPI/DEA and dates stay out of the summary. */
export function usEntryToExample(entry: UsDatasetEntry): CaseExampleInput {
  const gt = entry.groundTruth;
  const names = [gt.patient.firstName, gt.patient.lastName, gt.prescriber.name, gt.prescriber.clinic];
  const meds = gt.medications.map(
    (m, i) => `${i + 1}. ${m.writtenName}${m.generic && m.generic.toLowerCase() !== m.writtenName.toLowerCase() ? ` (${m.generic})` : ""}; strength ${m.strength ?? "MISSING"}; ${m.form} ${m.route}; sig ${m.sig ?? "MISSING"}; qty ${m.quantity ?? "MISSING"}; refills ${m.refills}`,
  );
  const reasons = uniq([...entry.injectedErrors.map((e) => e.code), ...entry.label.ruleFindings.map((f) => f.title)]);
  const reasonLines = [
    ...entry.injectedErrors.map((e) => `${e.code}: ${e.detail}`),
    ...entry.label.ruleFindings.map((f) => `rule ${f.origin} [${f.severity}]: ${f.title}`),
  ];
  const lines = [
    `Synthetic US prescription (${entry.style}, ${entry.difficulty}); scenario ${entry.scenario}`,
    `Prescriber on script: ${gt.prescriber.name ? "present" : "MISSING"}; date written: ${gt.dateWritten ? "present" : "MISSING"}`,
    `Medications:`,
    ...meds,
    `Allergies stated on script: ${gt.allergiesOnScript ?? "none stated"}`,
    ...patientContextLines(gt.patient),
    `Verdict: ${entry.label.verdict.toUpperCase()}${reasonLines.length ? ` because: ${reasonLines.join("; ")}` : " (no injected error and no rule fired)"}`,
  ];
  return {
    id: entry.id,
    dataset: "us-synthetic",
    scenario: entry.scenario,
    verdict: entry.label.verdict,
    reasons,
    summary: scrubIdentifiers(lines.join("\n"), names),
    payload: { ...entry },
  };
}

/** True for the subset of the photo dataset that is usable as an example. */
export function isUsableRxEntry(entry: DatasetEntry): boolean {
  return entry.document?.type === "prescription" && entry.extraction !== null && entry.duplicateOf === null;
}

/** Map a real-photo dataset entry to an example. Only the medication content and the rubric verdict are kept in the summary. */
export function rxEntryToExample(entry: DatasetEntry): CaseExampleInput {
  const ex = entry.extraction;
  if (!ex || !entry.document) throw new Error(`entry ${entry.id} has no extraction; filter with isUsableRxEntry first`);
  const names = [ex.patientName, ex.prescriberName];
  const meds = ex.medications.map(
    (m, i) =>
      `${i + 1}. ${m.rawName}${m.normalizedName ? ` (${m.normalizedName})` : " (not recognized)"}; strength ${m.strength ?? "MISSING"}; ${m.form ?? "form ?"}; sig ${m.sig ?? "MISSING"}; frequency ${m.frequency ?? "?"}; qty ${m.quantity ?? "MISSING"}${m.duration ? `; duration ${m.duration}` : ""}`,
  );
  const reasons = uniq(entry.label.issues.map((i) => i.code));
  const reasonLines = entry.label.issues.map((i) => `${i.code} (${i.severity}): ${i.detail}`);
  const lines = [
    `Real-world prescription photo (${entry.document.handwritten}, legibility ${entry.document.legibility.toFixed(2)}${entry.document.language ? `, ${entry.document.language}` : ""})`,
    `Patient named on document: ${ex.patientName ? "yes" : "NO"}; prescriber: ${ex.prescriberName ? "present" : "MISSING"}; date written: ${ex.dateWritten ? "present" : "MISSING"}`,
    `Medications:`,
    ...(meds.length ? meds : ["(none extracted)"]),
    `Allergies stated on document: ${ex.statedAllergies.length ? ex.statedAllergies.join(", ") : "none"}`,
    ex.notes ? `Clinical notes on document: ${ex.notes}` : "",
    `Extraction confidence ${ex.overallConfidence.toFixed(2)}`,
    `Verdict: ${entry.label.verdict.toUpperCase()}${reasonLines.length ? ` because: ${reasonLines.join("; ")}` : " (no rubric issue)"}`,
  ].filter((l) => l.length > 0);
  return {
    id: entry.id,
    dataset: "prescriptions",
    scenario: null,
    verdict: entry.label.verdict,
    reasons,
    summary: scrubIdentifiers(lines.join("\n"), names),
    payload: { ...entry },
  };
}
