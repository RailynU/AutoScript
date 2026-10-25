
import type { DashboardStats, PrescriptionStatus, ReviewStatus } from "@/lib/shared";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { REVIEW_STATUS_META, STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Queue filter: everything, one screening status, or one pharmacist review status. */
export type QueueFilter = "ALL" | `status:${PrescriptionStatus}` | `review:${ReviewStatus}`;

interface Tile {
  key: QueueFilter;
  label: string;
  dot: string;
  pick: (s: DashboardStats) => number;
  caption?: (s: DashboardStats) => string | null;
  pulse?: boolean;
}

/** One tile per screening status (null = not shown); adding a status without an entry fails typecheck. */
const SCREENING_TILES: Record<PrescriptionStatus, Tile | null> = {
  PROCESSING: { key: "status:PROCESSING", label: STATUS_META.PROCESSING.label, dot: STATUS_META.PROCESSING.dot, pick: (s) => s.processing, pulse: true },
  MANUAL_REVIEW_NEEDED: { key: "status:MANUAL_REVIEW_NEEDED", label: STATUS_META.MANUAL_REVIEW_NEEDED.label, dot: STATUS_META.MANUAL_REVIEW_NEEDED.dot, pick: (s) => s.manualReviewNeeded },
  NO_FLAGS_DETECTED: { key: "status:NO_FLAGS_DETECTED", label: STATUS_META.NO_FLAGS_DETECTED.label, dot: STATUS_META.NO_FLAGS_DETECTED.dot, pick: (s) => s.noFlagsDetected },
  FAILED: { key: "status:FAILED", label: STATUS_META.FAILED.label, dot: STATUS_META.FAILED.dot, pick: (s) => s.failed },
  /** Legacy combined value; not a queue segment. */
  REVIEWED: null,
};

/** One tile per review status; adding a status without an entry fails typecheck. */
const REVIEW_TILES: Record<ReviewStatus, Tile> = {
  PENDING_REVIEW: { key: "review:PENDING_REVIEW", label: REVIEW_STATUS_META.PENDING_REVIEW.label, dot: REVIEW_STATUS_META.PENDING_REVIEW.dot, pick: (s) => s.pendingReview },
  INFO_REQUESTED: { key: "review:INFO_REQUESTED", label: REVIEW_STATUS_META.INFO_REQUESTED.label, dot: REVIEW_STATUS_META.INFO_REQUESTED.dot, pick: (s) => s.infoRequested },
  INTERVENTION_REQUIRED: { key: "review:INTERVENTION_REQUIRED", label: REVIEW_STATUS_META.INTERVENTION_REQUIRED.label, dot: REVIEW_STATUS_META.INTERVENTION_REQUIRED.dot, pick: (s) => s.interventionRequired },
  INTERVENTION_DOCUMENTED: { key: "review:INTERVENTION_DOCUMENTED", label: REVIEW_STATUS_META.INTERVENTION_DOCUMENTED.label, dot: REVIEW_STATUS_META.INTERVENTION_DOCUMENTED.dot, pick: (s) => s.interventionDocumented },
  REVIEWED: {
    key: "review:REVIEWED",
    label: REVIEW_STATUS_META.REVIEWED.label,
    dot: REVIEW_STATUS_META.REVIEWED.dot,
    pick: (s) => s.reviewed,
    caption: (s) => `${s.reviewedToday} completed today`,
  },
};

const ALL_TILE: Tile = { key: "ALL", label: "All prescriptions", dot: "bg-primary", pick: (s) => s.total };
const screeningTiles: Tile[] = [ALL_TILE, ...Object.values(SCREENING_TILES).filter((t): t is Tile => t !== null)];
const reviewTiles: Tile[] = Object.values(REVIEW_TILES);
const ALL_TILES = [...screeningTiles, ...reviewTiles];

/** Human label for a filter, for the "showing" line above the table. */
export function queueFilterLabel(filter: QueueFilter): string {
  return ALL_TILES.find((t) => t.key === filter)?.label ?? filter;
}

/** Count the KPI tile shows for a filter; the table count for the same filter should match it. */
export function queueFilterCount(filter: QueueFilter, stats: DashboardStats): number | null {
  const tile = ALL_TILES.find((t) => t.key === filter);
  return tile ? tile.pick(stats) : null;
}

const TILE_CLASS = "relative flex flex-col items-start gap-1 bg-card p-3 text-left transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:p-4";
const ACTIVE_CLASS = "bg-accent/60 ring-2 ring-inset ring-primary hover:bg-accent/60";

function TileButton({ tile, stats, active, onClick }: { tile: Tile; stats: DashboardStats | null; active: boolean; onClick: () => void }) {
  const value = stats ? tile.pick(stats) : null;
  const caption = stats && tile.caption ? tile.caption(stats) : null;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(TILE_CLASS, active && ACTIVE_CLASS)}>
      <span className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("relative inline-flex size-1.5 shrink-0 rounded-full", tile.dot)}>
          {tile.pulse && value ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-75", tile.dot)} /> : null}
        </span>
        <span className={cn("truncate", active && "font-medium text-accent-foreground")}>{tile.label}</span>
        {active && <Check className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden />}
      </span>
      {stats ? (
        <span className={cn("text-2xl font-semibold tabular-nums", value === 0 && "text-muted-foreground/70")}>{value}</span>
      ) : (
        <Skeleton className="h-8 w-10" aria-hidden />
      )}
      {caption && <span className="text-[11px] text-muted-foreground">{caption}</span>}
    </button>
  );
}

interface QueueStripProps {
  stats: DashboardStats | null;
  filter: QueueFilter;
  onFilter: (f: QueueFilter) => void;
}

/** KPI strip doubling as the queue filter: one row for screening, one for the pharmacist's disposition. The active tile is ringed and ticked. */
export function QueueStrip({ stats, filter, onFilter }: QueueStripProps) {
  const toggle = (key: QueueFilter) => onFilter(filter === key || key === "ALL" ? "ALL" : key);
  return (
    <div className="space-y-3">
      <section aria-label="Screening status">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Screening (automated) · click a tile to filter</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {screeningTiles.map((tile) => (
            <TileButton key={tile.key} tile={tile} stats={stats} active={filter === tile.key} onClick={() => toggle(tile.key)} />
          ))}
        </div>
      </section>
      <section aria-label="Pharmacist review status">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pharmacist review</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {reviewTiles.map((tile) => (
            <TileButton key={tile.key} tile={tile} stats={stats} active={filter === tile.key} onClick={() => toggle(tile.key)} />
          ))}
        </div>
      </section>
    </div>
  );
}
