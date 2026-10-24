import type { EvidenceRef } from "@/lib/shared";
import { BookMarked, ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Retrieval = EvidenceRef["retrieval"];

/** How a reference reached the finding. Rule-attached evidence is what the rule table cites; the rest is contextual. */
const RETRIEVAL_META = {
  RULE: { label: "Rule-attached", hint: "Cited by the deterministic rule that produced the finding", chip: "bg-teal-50 text-teal-900 ring-teal-200", Icon: BookMarked, order: 0 },
  VECTOR: { label: "Contextual", hint: "Retrieved by similarity search; related reading, not the rule's citation", chip: "bg-slate-100 text-slate-700 ring-slate-200", Icon: Search, order: 1 },
  LEXICAL: { label: "Contextual", hint: "Retrieved by text search; related reading, not the rule's citation", chip: "bg-slate-100 text-slate-700 ring-slate-200", Icon: Search, order: 1 },
} as const satisfies Record<Retrieval, { label: string; hint: string; chip: string; Icon: typeof Search; order: number }>;

export interface EvidenceGroup {
  documentId: string;
  title: string;
  source: string;
  url: string | null;
  /** RULE when any chunk of the document was rule-attached. */
  retrieval: Retrieval;
  chunks: EvidenceRef[];
}

/** Groups citations by document so a reference cited through several chunks appears once, rule-attached first. */
export function groupEvidence(evidence: readonly EvidenceRef[]): EvidenceGroup[] {
  const byDoc = new Map<string, EvidenceGroup>();
  for (const e of evidence) {
    const existing = byDoc.get(e.documentId);
    if (!existing) {
      byDoc.set(e.documentId, { documentId: e.documentId, title: e.title, source: e.source, url: e.url, retrieval: e.retrieval, chunks: [e] });
      continue;
    }
    const chunks = existing.chunks.some((c) => c.chunkId === e.chunkId) ? existing.chunks : [...existing.chunks, e];
    byDoc.set(e.documentId, { ...existing, retrieval: e.retrieval === "RULE" ? "RULE" : existing.retrieval, chunks });
  }
  return [...byDoc.values()].sort((a, b) => RETRIEVAL_META[a.retrieval].order - RETRIEVAL_META[b.retrieval].order);
}

export function countByRetrieval(groups: readonly EvidenceGroup[]): { rule: number; contextual: number } {
  return groups.reduce((acc, g) => (g.retrieval === "RULE" ? { ...acc, rule: acc.rule + 1 } : { ...acc, contextual: acc.contextual + 1 }), { rule: 0, contextual: 0 });
}

export function RetrievalChip({ retrieval }: { retrieval: Retrieval }) {
  const meta = RETRIEVAL_META[retrieval];
  return (
    <span title={meta.hint} className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium ring-1 ring-inset", meta.chip)}>
      <meta.Icon className="size-3" aria-hidden />{meta.label}
    </span>
  );
}

function Excerpt({ chunk }: { chunk: EvidenceRef }) {
  return (
    <li>
      {chunk.section && <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">Section: {chunk.section}</p>}
      <blockquote className="border-l-2 border-primary/40 pl-2 text-[13px] leading-relaxed text-foreground/80">{chunk.excerpt}</blockquote>
    </li>
  );
}

function EvidenceGroupItem({ group }: { group: EvidenceGroup }) {
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{group.title}</p>
        <RetrievalChip retrieval={group.retrieval} />
      </div>
      <p className="text-xs text-muted-foreground">{group.source}</p>
      <details className="group/excerpt text-sm">
        <summary className="cursor-pointer list-none text-xs text-primary marker:content-none hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          <span className="group-open/excerpt:hidden">Show {group.chunks.length === 1 ? "excerpt" : `${group.chunks.length} excerpts`}</span>
          <span className="hidden group-open/excerpt:inline">Hide {group.chunks.length === 1 ? "excerpt" : "excerpts"}</span>
        </summary>
        <ul className="mt-2 space-y-2">{group.chunks.map((c) => <Excerpt key={c.chunkId} chunk={c} />)}</ul>
      </details>
      {group.url && (
        <a href={group.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          Open source <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </li>
  );
}

/** Expandable reference viewer: one entry per document, rule-attached citations before contextual ones. */
export function EvidenceList({ evidence }: { evidence: readonly EvidenceRef[] }) {
  const groups = groupEvidence(evidence);
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No references attached.</p>;
  return <ul className="divide-y rounded-lg border bg-muted/30">{groups.map((g) => <EvidenceGroupItem key={g.documentId} group={g} />)}</ul>;
}
