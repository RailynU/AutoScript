import type { ExtractedMedication, ExtractedPrescription, PrescriptionStatus } from "@/lib/shared";
import { AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  assessExtraction,
  EXTRACTION_REASON_LABEL,
  EXTRACTION_STATE_META,
  MEDICATION_FLAG_META,
  medicationFlags,
  type ExtractionStateMeta,
  type HighlightTone,
} from "@/lib/extractionState";

const STATE_TONE = {
  red: { chip: "bg-rose-50 text-rose-900 ring-rose-200", Icon: AlertOctagon },
  amber: { chip: "bg-amber-50 text-amber-900 ring-amber-200", Icon: AlertTriangle },
  neutral: { chip: "bg-slate-100 text-slate-700 ring-slate-200", Icon: Info },
} as const satisfies Record<ExtractionStateMeta["tone"], { chip: string; Icon: typeof Info }>;

const FLAG_TONE = {
  red: "bg-rose-50 text-rose-900 ring-rose-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
} as const satisfies Record<HighlightTone, string>;

const MAX_REASONS_SHOWN = 2;

function Field({ label, value, missing }: { label: string; value: string | null; missing?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-sm", !value && !missing && "text-amber-800", !value && missing && "text-muted-foreground")}>{value ?? missing ?? "not on document"}</dd>
    </div>
  );
}

function FlagChip({ label, tone }: { label: string; tone: HighlightTone }) {
  return <span className={cn("rounded px-1.5 py-px text-[11px] font-medium ring-1 ring-inset", FLAG_TONE[tone])}>{label}</span>;
}

function MedicationLine({ m, index }: { m: ExtractedMedication; index: number }) {
  const flags = medicationFlags(m);
  const unrecognized = flags.includes("UNRECOGNIZED");
  const uncertainDose = flags.includes("UNCERTAIN_DOSAGE");
  const highlighted = flags.length > 0;
  return (
    <li className={cn("rounded-lg border p-3", highlighted && (unrecognized ? "border-rose-300 bg-rose-50/30" : "border-amber-300 bg-amber-50/40"))}>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-tight">
          {index + 1}. {m.rawName}
          {m.strength ? <span className={cn("font-normal", uncertainDose && "text-amber-900")}> {m.strength}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {m.normalizedName ? (
            <>recognized as <span className="font-medium text-foreground">{m.normalizedName}</span>{m.normalizationSource === "LLM" ? " (model guess)" : ""}</>
          ) : (
            <span className="text-rose-900">not recognized, excluded from drug-specific checks</span>
          )}
          {m.form ? ` · ${m.form}` : ""}{m.route ? ` · ${m.route}` : ""}
        </p>
        {highlighted && (
          <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Line highlights">
            {flags.map((flag) => <FlagChip key={flag} label={MEDICATION_FLAG_META[flag].label} tone={MEDICATION_FLAG_META[flag].tone} />)}
          </div>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Sig</dt><dd className={cn(!m.sig && "text-amber-800")}>{m.sig ?? "missing"}</dd>
        <dt className="text-muted-foreground">Frequency</dt><dd className={cn(!m.frequency && "text-muted-foreground")}>{m.frequency ?? "—"}</dd>
        <dt className="text-muted-foreground">Route</dt><dd className={cn(!m.route && "text-amber-800")}>{m.route ?? "missing"}</dd>
        <dt className="text-muted-foreground">Quantity</dt><dd className={cn(!m.quantity && "text-amber-800")}>{m.quantity ?? "missing"}{m.refills ? <span className="text-muted-foreground"> · refills {m.refills}</span> : null}{m.duration ? <span className="text-muted-foreground"> · {m.duration}</span> : null}</dd>
        {m.indication && <><dt className="text-muted-foreground">For</dt><dd>{m.indication}</dd></>}
      </dl>
    </li>
  );
}

interface TranscriptionPaneProps {
  extraction: ExtractedPrescription;
  status: PrescriptionStatus;
}

/** Right pane: what the engine read from the document, laid out like the prescription itself. */
export function TranscriptionPane({ extraction, status }: TranscriptionPaneProps) {
  const assessment = assessExtraction({ status, extraction });
  const meta = EXTRACTION_STATE_META[assessment.state];
  const tone = STATE_TONE[meta.tone];
  const reasons = assessment.reasons.slice(0, MAX_REASONS_SHOWN).map((r) => EXTRACTION_REASON_LABEL[r]);
  const hiddenReasons = assessment.reasons.length - reasons.length;
  return (
    <section aria-label="Transcription" className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Transcription</p>
            <p className="truncate text-xs text-muted-foreground">Read by {extraction.extractor}. Compare each line with the original.</p>
          </div>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone.chip)} data-extraction-state={assessment.state}>
            <tone.Icon className="size-3" aria-hidden />
            {meta.label}
          </span>
        </div>
        <p className={cn("mt-1 text-xs", meta.tone === "neutral" ? "text-muted-foreground" : meta.tone === "red" ? "text-rose-900" : "text-amber-900")}>
          {meta.hint}
          {reasons.length > 0 && <span className="text-foreground/70"> Why: {reasons.join("; ")}{hiddenReasons > 0 ? ` (+${hiddenReasons} more)` : ""}.</span>}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {extraction.uncertainties.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Extractor could not read these parts</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{extraction.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/40 p-3">
          <Field label="Patient on document" value={extraction.patientName} />
          <Field label="Date of birth" value={extraction.patientDateOfBirth} />
          <Field label="Prescriber" value={extraction.prescriberName} />
          <Field label="Prescriber ID" value={extraction.prescriberIdentifier} missing="none" />
          <Field label="Date written" value={extraction.dateWritten} />
          <Field label="Allergies on document" value={extraction.statedAllergies.length ? extraction.statedAllergies.join(", ") : null} missing="none stated" />
        </dl>

        {extraction.medications.length === 0 ? (
          <p className="text-sm text-amber-800">No medication lines could be read.</p>
        ) : (
          <ol className="space-y-3">
            {extraction.medications.map((m, i) => <MedicationLine key={`${m.rawName}-${i}`} m={m} index={i} />)}
          </ol>
        )}
        {extraction.notes && <p className="text-xs text-muted-foreground">Notes on document: {extraction.notes}</p>}
      </div>
    </section>
  );
}
