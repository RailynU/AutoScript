import type { PrescriptionDetail } from "@/lib/shared";
import { ShieldAlert, UserRound } from "lucide-react";
import { ReviewStatusBadge, StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ageFromDob } from "@/lib/format";
import { buildSafetySummary, type SafetySummary } from "@/lib/safetySummary";
import { cn } from "@/lib/utils";

const MAX_MEDICATION_CHIPS = 4;
const MAX_MISSING_ITEMS = 3;

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 bg-card p-3", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function PatientCell({ rx, summary }: { rx: PrescriptionDetail; summary: SafetySummary }) {
  if (!summary.patientLinked) {
    return (
      <Cell label="Patient">
        <p className="flex items-center gap-1.5 font-semibold text-amber-900"><ShieldAlert className="size-4 shrink-0 text-amber-700" aria-hidden />{summary.patientLabel}</p>
        <p className="line-clamp-2 text-xs text-amber-950/75">{summary.documentPatientName ? `“${summary.documentPatientName}” on document, unmatched` : "Not identified on the document"}</p>
      </Cell>
    );
  }
  const dob = rx.patient?.dateOfBirth ?? null;
  const age = ageFromDob(dob);
  return (
    <Cell label="Patient">
      <p className="flex items-center gap-1.5 truncate font-semibold"><UserRound className="size-4 shrink-0 text-primary" aria-hidden />{summary.patientLabel}</p>
      <p className="truncate text-xs text-muted-foreground">{dob ? `DOB ${dob}${age != null ? ` (${age} y)` : ""}` : "DOB not on record"}</p>
    </Cell>
  );
}

function MedicationsCell({ summary }: { summary: SafetySummary }) {
  const shown = summary.medications.slice(0, MAX_MEDICATION_CHIPS);
  const more = summary.medications.length - shown.length;
  return (
    <Cell label={`Medications prescribed${summary.medications.length > 0 ? ` (${summary.medications.length})` : ""}`}>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{summary.pending ? "Extracting…" : "None read from the document"}</p>
      ) : (
        <ul className="flex flex-wrap gap-1" aria-label="Medication names">
          {shown.map((m) => <li key={m} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{m}</li>)}
          {more > 0 && <li className="text-xs text-muted-foreground">+{more}</li>}
        </ul>
      )}
    </Cell>
  );
}

function SeverityCell({ summary }: { summary: SafetySummary }) {
  return (
    <Cell label="Highest supported severity">
      {summary.pending ? (
        <p className="text-muted-foreground">Screening in progress</p>
      ) : summary.highestSupportedSeverity ? (
        <SeverityBadge severity={summary.highestSupportedSeverity} className="text-xs" />
      ) : (
        <p className="text-muted-foreground">None from rules</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {summary.highestAiSeverity ? <>AI observations up to <span className="font-medium text-foreground/80">{summary.highestAiSeverity.toLowerCase()}</span>, counted separately</> : "Rule-based findings only; AI observations counted separately"}
      </p>
    </Cell>
  );
}

function CountsCell({ summary }: { summary: SafetySummary }) {
  return (
    <Cell label="Findings">
      {summary.pending ? (
        <p className="text-muted-foreground">Pending</p>
      ) : (
        <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
          <div className="whitespace-nowrap"><dd className="inline text-xl font-semibold leading-none">{summary.ruleFindingCount}</dd> <dt className="inline whitespace-nowrap text-xs text-muted-foreground">rule-based</dt></div>
          <div className="whitespace-nowrap"><dd className="inline text-xl font-semibold leading-none">{summary.aiObservationCount}</dd> <dt className="inline whitespace-nowrap text-xs text-muted-foreground">AI observations</dt></div>
        </dl>
      )}
    </Cell>
  );
}

function MissingInfoCell({ summary }: { summary: SafetySummary }) {
  const shown = summary.missingPatientInfo.slice(0, MAX_MISSING_ITEMS);
  const more = summary.missingPatientInfo.length - shown.length;
  return (
    <Cell label="Missing patient information">
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{summary.pending ? "Pending" : "None flagged by rules"}</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-amber-950">
          {shown.map((item) => <li key={item} className="flex gap-1.5"><span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />{item}</li>)}
          {more > 0 && <li className="text-muted-foreground">+{more} more</li>}
        </ul>
      )}
    </Cell>
  );
}

/** Compact Clinical Safety Summary strip: everything a pharmacist needs before reading the findings, derived only from the prescription and its report. */
export function SafetySummaryStrip({ rx }: { rx: PrescriptionDetail }) {
  const summary = buildSafetySummary(rx);
  return (
    <section aria-label="Clinical safety summary" className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
        <PatientCell rx={rx} summary={summary} />
        <MedicationsCell summary={summary} />
        <Cell label="Screening · Review">
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={rx.status} />
            <ReviewStatusBadge reviewStatus={rx.reviewStatus} />
          </div>
        </Cell>
        <SeverityCell summary={summary} />
        <CountsCell summary={summary} />
        <MissingInfoCell summary={summary} />
      </div>
    </section>
  );
}
