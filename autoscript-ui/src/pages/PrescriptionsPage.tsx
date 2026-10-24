import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { PrescriptionListItem, PrescriptionStatus } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrescriptionTable } from "@/components/dashboard/PrescriptionTable";
import { useIntake } from "@/components/intake/IntakeProvider";
import { useQueue } from "@/hooks/useQueue";
import { STATUS_META, patientName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorBanner, PageHeader } from "./PageHeader";

const STATUS_FILTERS: Array<PrescriptionStatus | "ALL"> = ["ALL", "PROCESSING", "MANUAL_REVIEW_NEEDED", "NO_FLAGS_DETECTED", "FAILED"];

/** Case-insensitive match on patient name, Rx reference, file name or medication. */
function matchesQuery(rx: PrescriptionListItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [patientName(rx.patient), rx.externalRef, rx.fileName ?? "", ...rx.medicationSummary].some((v) => v.toLowerCase().includes(s));
}

export function PrescriptionsPage() {
  const { prescriptions, error } = useQueue();
  const { openIntake } = useIntake();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PrescriptionStatus | "ALL">("ALL");

  const visible = useMemo(
    () => (prescriptions ? prescriptions.filter((rx) => (status === "ALL" || rx.status === status) && matchesQuery(rx, query)) : null),
    [prescriptions, status, query],
  );
  const filtered = status !== "ALL" || query.trim() !== "";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prescriptions"
        description="Every prescription in the system. Search by patient, Rx reference or medication."
        actions={<Button onClick={() => openIntake()}><Plus data-icon="inline-start" />New prescription</Button>}
      />
      {error && <ErrorBanner message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Patient, Rx reference, medication…" className="pl-8" aria-label="Search prescriptions" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Screening status filter">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                status === s ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card text-muted-foreground",
              )}
            >
              {s !== "ALL" && <span className={cn("size-1.5 rounded-full", STATUS_META[s].dot)} aria-hidden />}
              {s === "ALL" ? "All" : STATUS_META[s].label}
            </button>
          ))}
        </div>
        {visible && prescriptions && (
          <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
            <span className="font-medium tabular-nums text-foreground">{visible.length}</span> of {prescriptions.length}
          </p>
        )}
      </div>

      <PrescriptionTable items={visible} filtered={filtered} onClearFilter={() => { setQuery(""); setStatus("ALL"); }} onNew={() => openIntake()} />
    </div>
  );
}
