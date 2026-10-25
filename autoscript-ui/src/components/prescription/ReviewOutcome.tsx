import { CheckCircle2, CircleHelp, ClipboardCheck, MessageSquareText, MoreHorizontal, PhoneCall, TriangleAlert, type LucideIcon } from "lucide-react";
import { REVIEW_KIND_TRANSITIONS, type PrescriptionDetail, type Review, type ReviewKind } from "@/lib/shared";
import { ReviewStatusBadge } from "@/components/StatusBadge";
import { REVIEW_KIND_META, REVIEW_STATUS_META, dateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  NOTE: MessageSquareText,
  MARK_REVIEWED: CheckCircle2,
  PRESCRIBER_CONTACTED: PhoneCall,
  INFO_REQUESTED: CircleHelp,
  INTERVENTION_REQUIRED: TriangleAlert,
  INTERVENTION_DOCUMENTED: ClipboardCheck,
  REVIEWED_NO_INTERVENTION: CheckCircle2,
  OTHER: MoreHorizontal,
} satisfies Record<ReviewKind, LucideIcon>;

function When({ iso, className }: { iso: string; className?: string }) {
  return <time dateTime={iso} title={dateTime(iso)} className={cn("whitespace-nowrap tabular-nums", className)}>{timeAgo(iso)}</time>;
}

/** Current disposition at a glance: status, who acted last and when, the latest note, completion time. */
export function ReviewOutcome({ rx }: { rx: PrescriptionDetail }) {
  const last = rx.reviews[0] ?? null;
  const latestNote = rx.reviews.find((r) => r.notes && r.notes.trim().length > 0) ?? null;
  const meta = REVIEW_STATUS_META[rx.reviewStatus];
  return (
    <section aria-label="Review outcome" className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Outcome</span>
          <ReviewStatusBadge reviewStatus={rx.reviewStatus} size="md" />
        </div>
        {rx.reviewedAt && <p className="text-xs text-muted-foreground">Review completed <When iso={rx.reviewedAt} /></p>}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{meta.description}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Last action</dt>
        <dd className="min-w-0">
          {last ? <><span className="font-medium">{last.pharmacistName}</span> {REVIEW_KIND_META[last.action].past}, <When iso={last.createdAt} className="text-muted-foreground" /></> : <span className="text-muted-foreground">none recorded</span>}
        </dd>
        <dt className="text-muted-foreground">Latest note</dt>
        <dd className="min-w-0">{latestNote ? <span className="line-clamp-2 whitespace-pre-wrap">{latestNote.notes}</span> : <span className="text-muted-foreground">none</span>}</dd>
      </dl>
    </section>
  );
}

function HistoryItem({ review, isLast }: { review: Review; isLast: boolean }) {
  const Icon = KIND_ICON[review.action];
  const next = REVIEW_KIND_TRANSITIONS[review.action];
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && <span className="absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-px bg-border" aria-hidden />}
      <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground"><Icon className="size-3.5" aria-hidden /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p><span className="font-medium">{review.pharmacistName}</span> <span className="text-muted-foreground">{REVIEW_KIND_META[review.action].past}</span></p>
          {next && <ReviewStatusBadge reviewStatus={next} />}
          <When iso={review.createdAt} className="text-xs text-muted-foreground" />
        </div>
        {review.notes && <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 px-2.5 py-1.5 text-foreground/90">{review.notes}</p>}
      </div>
    </li>
  );
}

/** Review history, newest first, as a compact timeline. */
export function ReviewHistory({ reviews }: { reviews: readonly Review[] }) {
  if (reviews.length === 0) return <p className="text-sm text-muted-foreground">No review activity yet. Record the first action above.</p>;
  return <ol className="mt-1">{reviews.map((r, i) => <HistoryItem key={r.id} review={r} isLast={i === reviews.length - 1} />)}</ol>;
}
