
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FilterX, Plus, Wifi, WifiOff } from "lucide-react";
import type { PrescriptionListItem } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { useQueue } from "@/hooks/useQueue";
import { useIntake } from "@/components/intake/IntakeProvider";
import { patientName } from "@/lib/format";
import { PrescriptionTable } from "./PrescriptionTable";
import { QueueStrip, queueFilterCount, queueFilterLabel, type QueueFilter } from "./QueueStrip";
import { SimulateMenu } from "./SimulateMenu";

const HIGHLIGHT_MS = 4000;

function applyFilter(prescriptions: PrescriptionListItem[], filter: QueueFilter): PrescriptionListItem[] {
  if (filter === "ALL") return prescriptions;
  if (filter.startsWith("status:")) {
    const status = filter.slice("status:".length);
    return prescriptions.filter((p) => p.status === status);
  }
  const reviewStatus = filter.slice("review:".length);
  return prescriptions.filter((p) => p.reviewStatus === reviewStatus);
}

interface ShowingLineProps {
  shown: number;
  total: number;
  filter: QueueFilter;
  /** Count the active KPI tile reports for this filter; shown when it disagrees with the table. */
  tileCount: number | null;
  onClear: () => void;
}

/** States which filter is active, how many rows it yields, and flags a tile/table mismatch instead of hiding it. */
function ShowingLine({ shown, total, filter, tileCount, onClear }: ShowingLineProps) {
  const filtered = filter !== "ALL";
  const mismatch = tileCount !== null && tileCount !== shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
      <p className="text-muted-foreground">
        Showing <span className="font-medium tabular-nums text-foreground">{shown}</span>
        {filtered ? <> of {total}, filtered by <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">{queueFilterLabel(filter)}</span></> : <> prescription{shown === 1 ? "" : "s"}, newest first</>}
        {mismatch && <span className="ml-2 text-xs text-amber-800">(tile shows {tileCount}; the list is catching up)</span>}
      </p>
      {filtered && (
        <Button variant="ghost" size="sm" onClick={onClear}><FilterX data-icon="inline-start" />Clear filter</Button>
      )}
    </div>
  );
}

export function Dashboard() {
  const { prescriptions, stats, error, connection, lastEvent, optimisticAdd } = useQueue();
  const { openIntake } = useIntake();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!lastEvent || lastEvent.type === "progress" || lastEvent.type === "created") return;
    const rx = lastEvent.prescription;
    const who = patientName(rx.patient);
    if (lastEvent.type === "completed") {
      const msg = rx.status === "MANUAL_REVIEW_NEEDED" ? `${who}: manual review needed (${rx.findingCount} finding${rx.findingCount === 1 ? "" : "s"})` : `${who}: no flags detected within checked criteria`;
      (rx.status === "MANUAL_REVIEW_NEEDED" ? toast.warning : toast.success)(msg, { description: rx.externalRef, action: { label: "Open", onClick: () => navigate(`/prescriptions/${rx.id}`) } });
    } else if (lastEvent.type === "failed") {
      toast.error(`${who}: processing failed`, { description: rx.failureReason ?? undefined });
    }
    setHighlightId(rx.id);
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [lastEvent, navigate]);

  const visible = useMemo(() => (prescriptions ? applyFilter(prescriptions, filter) : null), [prescriptions, filter]);
  const clearFilter = () => setFilter("ALL");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Today&apos;s prescriptions, newest first. Rows update live as the RX Engine works.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" title={connection === "live" ? "Live updates over server-sent events" : "Polling the API every few seconds"}>
            {connection === "live" ? <Wifi className="size-3.5 text-emerald-600" aria-hidden /> : <WifiOff className="size-3.5 text-amber-600" aria-hidden />}
            {connection === "live" ? "Live" : connection === "polling" ? "Polling" : "Connecting"}
          </span>
          <SimulateMenu onCreated={optimisticAdd} />
          <Button onClick={() => openIntake()}>
            <Plus data-icon="inline-start" />
            New prescription
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <QueueStrip stats={stats} filter={filter} onFilter={setFilter} />
      {visible && prescriptions && (
        <ShowingLine shown={visible.length} total={prescriptions.length} filter={filter} tileCount={stats ? queueFilterCount(filter, stats) : null} onClear={clearFilter} />
      )}
      <PrescriptionTable items={visible} highlightId={highlightId} filtered={filter !== "ALL"} onClearFilter={clearFilter} onNew={() => openIntake()} />
    </div>
  );
}
