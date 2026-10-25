
import { Link } from "react-router-dom";
import type { PrescriptionListItem, SourceType } from "@/lib/shared";
import { FileText, Image as ImageIcon, Type, Radio, ChevronRight, FilterX, Plus, type LucideIcon } from "lucide-react";
import { ReviewStatusBadge, StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StageTrackInline } from "@/components/StageTrack";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { patientName, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const SOURCE_ICON = { PDF: FileText, IMAGE: ImageIcon, TEXT: Type, SIMULATED: Radio } satisfies Record<SourceType, LucideIcon>;
const SKELETON_ROWS = 6;
const MAX_MEDICATION_CHIPS = 3;

const HEAD_CLASS = "[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium";

function TableHead() {
  return (
    <thead className="bg-muted/50 text-xs text-muted-foreground">
      <tr className={HEAD_CLASS}>
        <th scope="col" className="w-[34%] sm:w-[26%]">Patient</th>
        <th scope="col" className="hidden sm:table-cell sm:w-[26%]">Medications</th>
        <th scope="col" className="w-[40%] sm:w-[22%]">Screening · Review</th>
        <th scope="col" className="hidden w-[12%] md:table-cell">Findings</th>
        <th scope="col" className="w-[26%] text-right sm:w-[14%]">Received</th>
      </tr>
    </thead>
  );
}

function LoadingTable() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-busy="true" aria-label="Loading prescriptions">
      <table className="w-full table-fixed border-collapse text-sm">
        <TableHead />
        <tbody>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-1.5 h-3 w-1/2" /></td>
              <td className="hidden px-3 py-3 sm:table-cell"><div className="flex gap-1"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-12" /></div></td>
              <td className="px-3 py-3"><Skeleton className="h-5 w-28 rounded-full" /><Skeleton className="mt-1 h-5 w-20 rounded-full" /></td>
              <td className="hidden px-3 py-3 md:table-cell"><Skeleton className="h-5 w-14" /></td>
              <td className="px-3 py-3"><Skeleton className="ml-auto h-4 w-16" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface EmptyStateProps {
  filtered: boolean;
  onClearFilter: () => void;
  onNew: () => void;
}

function EmptyState({ filtered, onClearFilter, onNew }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center" role="status">
      <p className="text-sm font-medium">{filtered ? "No prescriptions match this filter." : "No prescriptions yet."}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered ? "Clear the filter to see the whole queue, or add a prescription." : "Upload a document, paste prescription text, or send a simulated scenario to see the engine work."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtered && <Button variant="outline" size="sm" onClick={onClearFilter}><FilterX data-icon="inline-start" />Clear filter</Button>}
        <Button size="sm" onClick={onNew}><Plus data-icon="inline-start" />New prescription</Button>
      </div>
    </div>
  );
}

function FindingsCell({ rx }: { rx: PrescriptionListItem }) {
  if (rx.status === "PROCESSING") return <span className="text-xs text-muted-foreground">—</span>;
  if (rx.findingCount === 0) return <span className="text-xs text-muted-foreground">0</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5" aria-label={`${rx.findingCount} findings, highest ${rx.highestSeverity ?? "unknown"}`}>
      <SeverityBadge severity={rx.highestSeverity} />
      <span className="tabular-nums text-muted-foreground">{rx.findingCount}</span>
    </span>
  );
}

function Row({ rx, highlighted }: { rx: PrescriptionListItem; highlighted: boolean }) {
  const Icon = SOURCE_ICON[rx.sourceType];
  const processing = rx.status === "PROCESSING";
  return (
    <tr className={cn("group relative border-t transition-colors hover:bg-muted/40 focus-within:bg-muted/40", highlighted && "bg-accent/40")}>
      <td className="px-3 py-2.5 align-top">
        <Link to={`/prescriptions/${rx.id}`} className="block min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring after:absolute after:inset-0 after:content-['']">
          <span className={cn("block truncate font-medium", !rx.patient && "text-amber-800")}>{patientName(rx.patient)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{rx.fileName ?? rx.externalRef}</span>
          </span>
        </Link>
      </td>
      <td className="hidden px-3 py-2.5 align-top sm:table-cell">
        {rx.medicationSummary.length ? (
          <div className="flex flex-wrap gap-1">
            {rx.medicationSummary.slice(0, MAX_MEDICATION_CHIPS).map((m) => <span key={m} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{m}</span>)}
            {rx.medicationSummary.length > MAX_MEDICATION_CHIPS && <span className="text-xs text-muted-foreground">+{rx.medicationSummary.length - MAX_MEDICATION_CHIPS}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{processing ? "Extracting…" : "—"}</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        {processing ? (
          <StageTrackInline stage={rx.progressStage} message={rx.progressMessage} />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={rx.status} />
            <ReviewStatusBadge reviewStatus={rx.reviewStatus} />
            {rx.status === "FAILED" && rx.failureReason && <span className="line-clamp-1 text-xs text-rose-700">{rx.failureReason}</span>}
          </div>
        )}
      </td>
      <td className="hidden px-3 py-2.5 align-top md:table-cell"><FindingsCell rx={rx} /></td>
      <td className="px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <time dateTime={rx.createdAt} title={rx.createdAt}>{timeAgo(rx.createdAt)}</time>
          <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden />
        </span>
      </td>
    </tr>
  );
}

interface PrescriptionTableProps extends EmptyStateProps {
  items: PrescriptionListItem[] | null;
  highlightId?: string | null;
  /** Plain empty message instead of the actionable empty state (used by section lists). */
  emptyText?: string;
}

/** Queue table, newest first. Shows a table-shaped skeleton while loading and an actionable empty state. */
export function PrescriptionTable({ items, highlightId, filtered, onClearFilter, onNew, emptyText }: PrescriptionTableProps) {
  if (!items) return <LoadingTable />;
  if (items.length === 0 && emptyText) return <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground" role="status">{emptyText}</p>;
  if (items.length === 0) return <EmptyState filtered={filtered} onClearFilter={onClearFilter} onNew={onNew} />;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full table-fixed border-collapse text-sm" aria-label="Prescriptions, newest first">
        <TableHead />
        <tbody>{items.map((rx) => <Row key={rx.id} rx={rx} highlighted={highlightId === rx.id} />)}</tbody>
      </table>
    </div>
  );
}
