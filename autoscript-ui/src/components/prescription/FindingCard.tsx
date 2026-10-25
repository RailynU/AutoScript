
import { fillFindingDefaults, type Finding, type SeveritySource, type TherapyContext } from "@/lib/shared";
import { Clock, ShieldQuestion, Sparkles } from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { FINDING_TYPE_LABEL, SEVERITY_META, severityMeta } from "@/lib/format";
import { isAiObservation } from "@/lib/safetySummary";
import { cn } from "@/lib/utils";
import { countByRetrieval, EvidenceList, groupEvidence } from "./EvidenceList";
import { splitLead, splitQuestions } from "@/lib/findingText";

const CHIP = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset";

/** Short course vs ongoing therapy. Adding a TherapyContext member fails typecheck until mapped. */
const THERAPY_CONTEXT_META = {
  ACUTE_SHORT_COURSE: { label: "Short course", chip: "bg-sky-50 text-sky-900 ring-sky-200" },
  CHRONIC: { label: "Chronic", chip: "bg-indigo-50 text-indigo-900 ring-indigo-200" },
  UNKNOWN: { label: "Duration unknown", chip: "bg-slate-100 text-slate-700 ring-slate-200" },
} as const satisfies Record<TherapyContext, { label: string; chip: string }>;

/** Where the shown severity came from. Adding a SeveritySource member fails typecheck until mapped. */
const SEVERITY_SOURCE_META = {
  RULE_TABLE: { label: "Rule table", chip: "bg-teal-50 text-teal-900 ring-teal-200", hint: "Severity set by the curated deterministic rule table" },
  AI_PROPOSED: { label: "AI proposed", chip: "bg-violet-50 text-violet-800 ring-violet-200", hint: "Severity proposed by the model and backed by at least one accepted citation" },
  AI_PROPOSED_UNSUPPORTED: { label: "AI proposed, unsupported", chip: "bg-amber-50 text-amber-900 ring-amber-200", hint: "Severity proposed by the model without an accepted citation; shown clamped to Low" },
} as const satisfies Record<SeveritySource, { label: string; chip: string; hint: string }>;

/** Traceability chips: therapy context, severity source, and an explicit tag when an AI observation has no accepted citation. */
function TraceabilityChips({ finding }: { finding: Finding }) {
  const traced = fillFindingDefaults(finding);
  const therapy = THERAPY_CONTEXT_META[finding.therapyContext ?? "UNKNOWN"];
  const source = SEVERITY_SOURCE_META[traced.severitySource];
  return (
    <>
      <span className={cn(CHIP, source.chip)} title={`${source.hint} (${finding.origin})`}>{source.label}</span>
      <span className={cn(CHIP, therapy.chip)} title={finding.therapyContextBasis ?? undefined}><Clock className="size-3" aria-hidden />{therapy.label}</span>
      {traced.supportStatus === "UNVERIFIED" && (
        <span className={cn(CHIP, "bg-amber-50 text-amber-900 ring-amber-300")} title="No accepted citation supports this observation"><ShieldQuestion className="size-3" aria-hidden />Needs verification</span>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Medications({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;
  return (
    <div>
      <SectionLabel>Medications involved</SectionLabel>
      <ul className="mt-1 flex flex-wrap gap-1" aria-label="Medications involved">
        {names.map((n) => <li key={n} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{n}</li>)}
      </ul>
    </div>
  );
}

function AiInterpretation({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-violet-200/70 bg-violet-50/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-800"><Sparkles className="size-3" aria-hidden />AI interpretation, not evidence</p>
      <p className="mt-1 text-sm leading-relaxed text-violet-950">{text}</p>
    </div>
  );
}

function QuestionList({ questions }: { questions: readonly string[] }) {
  return (
    <ul className="mt-1.5 space-y-1.5 text-sm">
      {questions.map((q) => <li key={q} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{q}</li>)}
    </ul>
  );
}

function Questions({ questions }: { questions: readonly string[] }) {
  if (questions.length === 0) return null;
  const { visible, folded } = splitQuestions(questions);
  return (
    <div>
      <SectionLabel>Ask before dispensing</SectionLabel>
      <QuestionList questions={visible} />
      {folded.length > 0 && (
        <details className="group/q mt-1">
          <summary className="cursor-pointer list-none text-xs text-primary marker:content-none hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <span className="group-open/q:hidden">{folded.length} more</span>
            <span className="hidden group-open/q:inline">Show fewer</span>
          </summary>
          <QuestionList questions={folded} />
        </details>
      )}
    </div>
  );
}

function WhyItMatters({ text }: { text: string }) {
  const { lead, rest } = splitLead(text);
  return (
    <div>
      <SectionLabel>Why it matters</SectionLabel>
      <p className="mt-1 text-sm leading-relaxed text-foreground/85">{lead}</p>
      {rest && (
        <details className="group/why">
          <summary className="cursor-pointer list-none text-xs text-primary marker:content-none hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <span className="group-open/why:hidden">Details</span>
            <span className="hidden group-open/why:inline">Hide details</span>
          </summary>
          <p className="mt-1 text-sm leading-relaxed text-foreground/75">{rest}</p>
        </details>
      )}
    </div>
  );
}

function References({ finding }: { finding: Finding }) {
  if (finding.evidence.length === 0) return null;
  const groups = groupEvidence(finding.evidence);
  const { rule, contextual } = countByRetrieval(groups);
  const parts = [rule > 0 ? `${rule} rule-attached` : null, contextual > 0 ? `${contextual} contextual` : null].filter((p): p is string => p !== null);
  return (
    <details className="group/refs">
      <summary className="cursor-pointer list-none text-sm text-primary marker:content-none hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        <span className="group-open/refs:hidden">Show supporting references ({parts.join(", ")})</span>
        <span className="hidden group-open/refs:inline">Hide supporting references</span>
      </summary>
      <div className="mt-2"><EvidenceList evidence={finding.evidence} /></div>
    </details>
  );
}

/**
 * One finding: severity, title, medications, why it matters (engine explanation), the AI's
 * interpretation set apart from evidence, suggested questions, and an expandable reference viewer.
 */
export function FindingCard({ finding }: { finding: Finding }) {
  const meta = severityMeta(finding.severity);
  const ai = isAiObservation(finding);
  const traced = fillFindingDefaults(finding);
  return (
    <article className="relative overflow-hidden rounded-xl border bg-card" aria-labelledby={`finding-${finding.id}`}>
      <span className={cn("absolute inset-y-0 left-0 w-1", meta?.bar)} aria-hidden />
      <div className="space-y-3 p-4 pl-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SeverityBadge severity={finding.severity} />
          <span>{FINDING_TYPE_LABEL[finding.type] ?? finding.type}</span>
          {ai && <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200"><Sparkles className="size-3" aria-hidden />AI observation, verify</span>}
          <TraceabilityChips finding={finding} />
        </div>
        <h3 id={`finding-${finding.id}`} className="text-base font-semibold leading-snug">{finding.title}</h3>
        {traced.proposedSeverity && traced.proposedSeverity !== finding.severity && (
          <p className="text-xs text-muted-foreground">Model proposed <span className="font-medium">{SEVERITY_META[traced.proposedSeverity].label}</span>; shown as {SEVERITY_META[finding.severity].label} because the proposal was not supported by accepted evidence.</p>
        )}
        <Medications names={finding.medications} />
        <WhyItMatters text={finding.explanation} />
        {finding.aiContext && <AiInterpretation text={finding.aiContext} />}
        <Questions questions={finding.reviewQuestions} />
        <References finding={finding} />
      </div>
    </article>
  );
}
