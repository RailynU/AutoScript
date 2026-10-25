import type { AnalysisReport } from "@/lib/shared";
import { ExternalLink, Sparkles } from "lucide-react";
import { countByRetrieval, groupEvidence, RetrievalChip } from "./EvidenceList";

const RETRIEVAL_LABEL = {
  VECTOR: "vector similarity",
  LEXICAL: "text search",
  NONE: "none",
} as const satisfies Record<AnalysisReport["coverage"]["retrievalMethod"], string>;

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function SupportingEvidence({ report }: { report: AnalysisReport }) {
  const groups = groupEvidence(report.evidence);
  const { rule, contextual } = countByRetrieval(groups);
  return (
    <div>
      <Heading>Supporting evidence</Heading>
      {groups.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No references were cited.</p>
      ) : (
        <details className="group/src mt-1 text-sm">
          <summary className="cursor-pointer list-none marker:content-none focus-visible:outline-2 focus-visible:outline-ring">
            <span className="tabular-nums">{groups.length} source{groups.length === 1 ? "" : "s"}</span>
            <span className="text-muted-foreground"> · {rule} rule-attached, {contextual} contextual · </span>
            <span className="text-primary group-open/src:hidden">show</span><span className="hidden text-primary group-open/src:inline">hide</span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {groups.map((g) => (
              <li key={g.documentId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <RetrievalChip retrieval={g.retrieval} />
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                {g.url && <a href={g.url} target="_blank" rel="noreferrer" aria-label={`Open ${g.title}`} className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><ExternalLink className="size-3.5" /></a>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Uncertainties({ report }: { report: AnalysisReport }) {
  const items = [
    ...report.extraction.uncertainties.map((u) => `Document: ${u}`),
    ...(report.ai && report.ai.rejectedCitations.length > 0 ? [`${report.ai.rejectedCitations.length} citation(s) to unknown sources were dropped from the AI output.`] : []),
  ];
  return (
    <div>
      <Heading>Relevant uncertainties</Heading>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None reported by the extractor.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">{items.map((i) => <li key={i} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />{i}</li>)}</ul>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** Collapsed technical detail: only values the report already stores. No chain-of-thought is rendered. */
function TechnicalAnalysis({ report }: { report: AnalysisReport }) {
  const { coverage, ai } = report;
  return (
    <details className="rounded-lg border bg-muted/30 text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-foreground/80 focus-visible:outline-2 focus-visible:outline-ring">Technical analysis</summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t px-3 py-2.5">
        <Row label="Model">{ai ? ai.model : "did not run"}</Row>
        <Row label="Rules evaluated">{coverage.rulesEvaluated.length}: <span className="font-mono text-[11px]">{coverage.rulesEvaluated.join(", ")}</span></Row>
        <Row label="Reference documents">{coverage.referenceDocumentsSearched} searched, retrieval by {RETRIEVAL_LABEL[coverage.retrievalMethod]}</Row>
        {ai && <Row label="Tokens">{ai.promptTokens ?? "?"} prompt, {ai.completionTokens ?? "?"} completion, {(ai.durationMs / 1000).toFixed(1)} s</Row>}
        {ai && <Row label="Calibration cases">{ai.similarCases.length} labelled example{ai.similarCases.length === 1 ? "" : "s"} shown to the model (never cited as evidence)</Row>}
        {ai && ai.rejectedCitations.length > 0 && <Row label="Dropped citations"><span className="font-mono text-[11px]">{ai.rejectedCitations.join(", ")}</span></Row>}
        <Row label="Engine version">{report.engineVersion}</Row>
      </dl>
      {coverage.limitations.length > 0 && (
        <div className="border-t px-3 py-2.5">
          <p className="font-medium text-foreground/80">Limitations reported by the engine</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{coverage.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      {ai && (
        <details className="border-t px-3 py-2.5">
          <summary className="cursor-pointer font-medium text-foreground/80 focus-visible:outline-2 focus-visible:outline-ring">Model narrative as stored in the report (cites evidence ids)</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground/80">{ai.reasoning}</p>
        </details>
      )}
    </details>
  );
}

/** AI analysis as a structured block: concise summary, evidence, uncertainties, then collapsed technical detail. */
export function AiAnalysisBlock({ report }: { report: AnalysisReport }) {
  const { ai } = report;
  return (
    <section aria-label="AI analysis" className="space-y-3 rounded-xl border border-violet-200/70 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-violet-950"><Sparkles className="size-4 text-violet-600" aria-hidden />AI analysis</h2>
        <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200">Interpretation, not evidence</span>
        {ai && <span className="text-xs text-muted-foreground">{ai.model}</span>}
      </div>
      <p className="text-sm leading-relaxed text-violet-950">{ai ? ai.summary : "AI analysis did not complete. Only deterministic rules contributed to this report."}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SupportingEvidence report={report} />
        <Uncertainties report={report} />
      </div>
      <TechnicalAnalysis report={report} />
    </section>
  );
}
