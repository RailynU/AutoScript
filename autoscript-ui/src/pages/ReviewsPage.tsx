import { useMemo, type ReactNode } from "react";
import { SEVERITY_RANK, type PrescriptionListItem, type Severity } from "@/lib/shared";
import { PrescriptionTable } from "@/components/dashboard/PrescriptionTable";
import { useIntake } from "@/components/intake/IntakeProvider";
import { useQueue } from "@/hooks/useQueue";
import { ErrorBanner, PageHeader } from "./PageHeader";

const OPEN_REVIEW = new Set(["PENDING_REVIEW", "INFO_REQUESTED", "INTERVENTION_REQUIRED"]);

function rank(s: string | null): number {
  return s ? (SEVERITY_RANK[s as Severity] ?? 0) : 0;
}

function Section({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      {children}
    </section>
  );
}

/** The pharmacist's work queue: open reviews most severe first, failures to retry, then completed reviews. */
export function ReviewsPage() {
  const { prescriptions, error } = useQueue();
  const { openIntake } = useIntake();

  const { open, failed, done } = useMemo(() => {
    const list: PrescriptionListItem[] = prescriptions ?? [];
    return {
      open: list
        .filter((r) => r.status !== "PROCESSING" && r.status !== "FAILED" && OPEN_REVIEW.has(r.reviewStatus))
        .sort((a, b) => rank(b.highestSeverity) - rank(a.highestSeverity) || a.createdAt.localeCompare(b.createdAt)),
      failed: list.filter((r) => r.status === "FAILED"),
      done: list.filter((r) => r.reviewedAt).sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")),
    };
  }, [prescriptions]);

  const loading = prescriptions === null;
  const noop = () => undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="Prescriptions waiting on a pharmacist, most severe first. Recording a review documents what you did; it is not a dispensing approval." />
      {error && <ErrorBanner message={error} />}

      <Section title={`Needs pharmacist review${loading ? "" : ` (${open.length})`}`} caption="Pending, info requested or intervention required; highest severity first, then oldest.">
        <PrescriptionTable items={loading ? null : open} filtered onClearFilter={noop} onNew={() => openIntake()} emptyText="Nothing is waiting for a pharmacist." />
      </Section>

      {failed.length > 0 && (
        <Section title={`Screening failed (${failed.length})`} caption="Open one to see the reason and retry the analysis.">
          <PrescriptionTable items={failed} filtered onClearFilter={noop} onNew={() => openIntake()} />
        </Section>
      )}

      <Section title={`Completed reviews${loading ? "" : ` (${done.length})`}`} caption="Reviewed or intervention documented, most recent first.">
        <PrescriptionTable items={loading ? null : done} filtered onClearFilter={noop} onNew={() => openIntake()} emptyText="No completed reviews yet." />
      </Section>
    </div>
  );
}
