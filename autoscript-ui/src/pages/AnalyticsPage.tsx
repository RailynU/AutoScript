import { useMemo } from "react";
import type { Severity } from "@/lib/shared";
import { SeverityBadge } from "@/components/SeverityBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueue } from "@/hooks/useQueue";
import { REVIEW_STATUS_META, SEVERITY_META, STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorBanner, PageHeader } from "./PageHeader";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MODERATE", "LOW", "INFO"];

function Kpi({ label, value, caption }: { label: string; value: number | null; caption?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      {value === null ? <Skeleton className="h-8 w-12" /> : <span className={cn("text-2xl font-semibold tabular-nums", value === 0 && "text-muted-foreground/70")}>{value}</span>}
      {caption && <span className="text-[11px] text-muted-foreground">{caption}</span>}
    </div>
  );
}

function Bars({ title, caption, rows }: { title: string; caption: string; rows: Array<{ key: string; label: React.ReactNode; value: number; bar: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <dt className="truncate">{r.label}</dt>
            <dd className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full transition-[width]", r.bar)} style={{ width: `${(r.value / max) * 100}%` }} />
            </dd>
            <dd className="text-right tabular-nums text-muted-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Screening outcomes and review workload across the prescriptions currently loaded. */
export function AnalyticsPage() {
  const { prescriptions, stats, error } = useQueue();

  const { bySeverity, totalFindings, withFindings } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    let flagged = 0;
    for (const r of prescriptions ?? []) {
      total += r.findingCount;
      if (r.findingCount > 0) flagged += 1;
      if (r.highestSeverity) counts.set(r.highestSeverity, (counts.get(r.highestSeverity) ?? 0) + 1);
    }
    return { bySeverity: SEVERITIES.map((s) => ({ severity: s, count: counts.get(s) ?? 0 })), totalFindings: total, withFindings: flagged };
  }, [prescriptions]);

  const loaded = prescriptions !== null;

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Screening outcomes and pharmacist workload. Counts describe what the checks flagged, not clinical safety." />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total prescriptions" value={stats?.total ?? null} />
        <Kpi label="Findings raised" value={loaded ? totalFindings : null} caption={loaded ? `on ${withFindings} prescription${withFindings === 1 ? "" : "s"}` : undefined} />
        <Kpi label="Reviewed today" value={stats?.reviewedToday ?? null} />
        <Kpi label="Interventions required" value={stats?.interventionRequired ?? null} />
        <Kpi label="Failed screenings" value={stats?.failed ?? null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bars
          title="Highest severity per prescription"
          caption="Each prescription counted once, at its most severe finding."
          rows={bySeverity.map(({ severity, count }) => ({ key: severity, label: <SeverityBadge severity={severity} />, value: count, bar: SEVERITY_META[severity].bar }))}
        />
        <Bars
          title="Screening status"
          caption="What the RX Engine concluded."
          rows={
            stats
              ? [
                  { key: "MANUAL_REVIEW_NEEDED", label: STATUS_META.MANUAL_REVIEW_NEEDED.label, value: stats.manualReviewNeeded, bar: STATUS_META.MANUAL_REVIEW_NEEDED.dot },
                  { key: "NO_FLAGS_DETECTED", label: STATUS_META.NO_FLAGS_DETECTED.label, value: stats.noFlagsDetected, bar: STATUS_META.NO_FLAGS_DETECTED.dot },
                  { key: "PROCESSING", label: STATUS_META.PROCESSING.label, value: stats.processing, bar: STATUS_META.PROCESSING.dot },
                  { key: "FAILED", label: STATUS_META.FAILED.label, value: stats.failed, bar: STATUS_META.FAILED.dot },
                ]
              : []
          }
        />
        <Bars
          title="Pharmacist review status"
          caption="Dispositions recorded by pharmacists. None of these is a dispensing approval."
          rows={
            stats
              ? [
                  { key: "PENDING_REVIEW", label: REVIEW_STATUS_META.PENDING_REVIEW.label, value: stats.pendingReview, bar: REVIEW_STATUS_META.PENDING_REVIEW.dot },
                  { key: "INFO_REQUESTED", label: REVIEW_STATUS_META.INFO_REQUESTED.label, value: stats.infoRequested, bar: REVIEW_STATUS_META.INFO_REQUESTED.dot },
                  { key: "INTERVENTION_REQUIRED", label: REVIEW_STATUS_META.INTERVENTION_REQUIRED.label, value: stats.interventionRequired, bar: REVIEW_STATUS_META.INTERVENTION_REQUIRED.dot },
                  { key: "INTERVENTION_DOCUMENTED", label: REVIEW_STATUS_META.INTERVENTION_DOCUMENTED.label, value: stats.interventionDocumented, bar: REVIEW_STATUS_META.INTERVENTION_DOCUMENTED.dot },
                  { key: "REVIEWED", label: REVIEW_STATUS_META.REVIEWED.label, value: stats.reviewed, bar: REVIEW_STATUS_META.REVIEWED.dot },
                ]
              : []
          }
        />
      </div>
    </div>
  );
}
