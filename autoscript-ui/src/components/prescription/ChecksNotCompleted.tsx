
import { CircleSlash } from "lucide-react";
import type { ChecksNotCompleted as ChecksNotCompletedData } from "@/lib/checksCoverage";

/**
 * Compact list of checks that did not fully run, built only from the report. It names gaps;
 * it never states that anything is safe or invents patient data.
 */
export function ChecksNotCompletedBlock({ data }: { data: ChecksNotCompletedData }) {
  return (
    <section aria-label="Checks not completed" className="rounded-xl border border-amber-300/70 bg-amber-50/50 p-3.5 text-sm">
      <h2 className="flex items-center gap-2 font-semibold text-amber-950">
        <CircleSlash className="size-4 text-amber-700" aria-hidden />
        Checks not completed
      </h2>
      <ul className="mt-2 space-y-2 text-amber-950/90">
        {data.patientContextUnavailable && (
          <li>
            <p className="font-medium">Patient context unavailable</p>
            <p className="text-xs text-amber-950/75">No patient record is linked, so these checks had no allergies, current medications, conditions or demographics to use:</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {data.patientDependent.map((c) => (
                <li key={c.ruleId} className="rounded bg-white/70 px-1.5 py-px text-xs ring-1 ring-inset ring-amber-200" title={c.ruleId}>
                  {c.label}: <span className="font-medium">{c.note}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
        {data.unrecognizedMedications.length > 0 && (
          <li>
            <span className="font-medium">Not recognized, excluded from drug-specific checks:</span> {data.unrecognizedMedications.join(", ")}
          </li>
        )}
        {data.undosedMedications.length > 0 && (
          <li>
            <span className="font-medium">Daily-dose check skipped (no strength or directions):</span> {data.undosedMedications.join(", ")}
          </li>
        )}
        {data.aiNotCompleted && <li><span className="font-medium">AI analysis did not complete.</span> Only deterministic rules contributed.</li>}
        {data.noReferenceRetrieval && <li><span className="font-medium">No reference documents searched.</span> Findings carry no cited evidence.</li>}
      </ul>
      {data.limitations.length > 0 && (
        <details className="mt-2 text-xs text-amber-950/80">
          <summary className="cursor-pointer">Limitations reported by the engine ({data.limitations.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{data.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
