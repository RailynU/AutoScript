
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AnalysisReport } from "@/lib/shared";
import { cn } from "@/lib/utils";
import { checksNotCompleted, FINDING_GROUP_META, groupFindings, hasChecksNotCompleted, type FindingGroup } from "@/lib/checksCoverage";
import { AiAnalysisBlock } from "./AiAnalysisBlock";
import { ChecksNotCompletedBlock } from "./ChecksNotCompleted";
import { FindingCard } from "./FindingCard";

interface FindingsPanelProps {
  report: AnalysisReport;
  /** `rx.patientContext !== null`; decides whether patient-dependent checks could run. */
  patientLinked: boolean;
}

/** Body of the Findings tab: disposition, checks not completed, grouped findings, then the structured AI analysis block. */
export function FindingsPanel({ report, patientLinked }: FindingsPanelProps) {
  const gaps = checksNotCompleted(report, patientLinked);
  const groups = groupFindings(report.findings, report.extraction);
  return (
    <>
      <DispositionLine report={report} />
      {hasChecksNotCompleted(gaps) && <ChecksNotCompletedBlock data={gaps} />}
      {groups.length === 0 && <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">No findings were produced within the checked criteria.</p>}
      {groups.map(({ group, findings }) => (
        <section key={group} aria-label={FINDING_GROUP_META[group].title} className="space-y-2">
          <GroupHeading group={group} count={findings.length} patientLinked={patientLinked} />
          {findings.map((f) => <FindingCard key={f.id} finding={f} />)}
        </section>
      ))}
      <AiAnalysisBlock report={report} />
    </>
  );
}

function GroupHeading({ group, count, patientLinked }: { group: FindingGroup; count: number; patientLinked: boolean }) {
  const meta = FINDING_GROUP_META[group];
  const noRecord = group === "PATIENT_RECORD" && !patientLinked;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 pt-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {noRecord ? "Patient record" : meta.title} <span className="font-normal tabular-nums">({count})</span>
      </h2>
      <p className="text-[11px] text-muted-foreground">{noRecord ? "No record was linked; these describe what could not be checked." : meta.caption}</p>
    </div>
  );
}

function DispositionLine({ report }: { report: AnalysisReport }) {
  const needsReview = report.disposition === "MANUAL_REVIEW_NEEDED";
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5 text-sm", needsReview ? "border-amber-300/70 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/70")}>
      {needsReview ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />}
      <p>
        <span className="font-semibold">{needsReview ? "Manual review needed. " : "No flags detected within checked criteria. "}</span>
        <span className="text-foreground/80">{needsReview ? report.dispositionReason : "Not a statement of clinical safety; complete your own review, then record your disposition."}</span>
      </p>
    </div>
  );
}
