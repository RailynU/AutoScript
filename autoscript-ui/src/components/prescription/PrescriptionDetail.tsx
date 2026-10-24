
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StageTimeline } from "@/components/StageTrack";
import { usePrescription } from "@/hooks/usePrescription";
import { api } from "@/lib/api";
import { dateTime, patientName } from "@/lib/format";
import { isEntryMismatch } from "@/lib/entryCheck";
import { DocumentPane } from "./DocumentPane";
import { EntryCheckPanel } from "./EntryCheckPanel";
import { FindingsPanel } from "./FindingsPanel";
import { PatientContextCard } from "./PatientContextCard";
import { ReviewPanel } from "./ReviewPanel";
import { SafetySummaryStrip } from "./SafetySummaryStrip";
import { TranscriptionPane } from "./TranscriptionPane";

/**
 * Layout: at xl (≥1280px) a two-column grid. Column 1 holds the Original | Transcription
 * dual-pane and then the Findings/Review tabs; column 2 is the patient record, spanning both
 * rows and sticky, so allergies, medications and conditions stay beside the findings while
 * the pharmacist scrolls. Below xl everything stacks: dual-pane, patient record, findings.
 */
const MAIN_COL = "xl:col-start-1";
const SIDE_COL = "xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto";

export function PrescriptionDetail({ id }: { id: string }) {
  const { prescription: rx, error, refresh, setPrescription } = usePrescription(id);
  const [tab, setTab] = useState("findings");
  const [marking, setMarking] = useState(false);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      </div>
    );
  }
  if (!rx) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-[480px] rounded-xl" /><Skeleton className="h-[480px] rounded-xl" /></div>
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    );
  }

  const report = rx.report;
  const processing = rx.status === "PROCESSING";
  const failed = rx.status === "FAILED";
  const canMark = rx.status === "MANUAL_REVIEW_NEEDED" || rx.status === "NO_FLAGS_DETECTED";
  const findings = report?.findings ?? [];
  const entryMismatches = findings.filter(isEntryMismatch).length;
  const hasDocument = Boolean(report || rx.sourceType !== "TEXT" || rx.rawText);

  const retry = async () => {
    try {
      await api.retry(rx.id);
      toast.info("Re-queued for analysis");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  };

  const markReviewed = async () => {
    setMarking(true);
    try {
      setPrescription(await api.review(rx.id, { action: "REVIEWED_NO_INTERVENTION", pharmacistName: "Dr. Jane Doe", notes: null }));
      toast.success("Review recorded: reviewed, no intervention. This is not a dispensing approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark reviewed");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{patientName(rx.patient)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{rx.externalRef} · received {dateTime(rx.createdAt)}{rx.reviewedAt ? ` · reviewed ${dateTime(rx.reviewedAt)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {failed && <Button variant="outline" onClick={retry}><RotateCcw data-icon="inline-start" />Retry analysis</Button>}
          {canMark && (
            <Button onClick={markReviewed} disabled={marking}><CheckCircle2 data-icon="inline-start" />{marking ? "Saving…" : "Mark reviewed"}</Button>
          )}
        </div>
      </header>

      <SafetySummaryStrip rx={rx} />

      {processing && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Loader2 className="size-4 animate-spin text-sky-600" />Analysis in progress</p>
          <StageTimeline stage={rx.progressStage} message={rx.progressMessage} />
        </div>
      )}
      {failed && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm">
          <p className="font-medium text-rose-900">Processing failed</p>
          <p className="mt-1 text-rose-900/90">{rx.failureReason}</p>
          <p className="mt-1 text-xs text-muted-foreground">If the message mentions the LLM provider, add LLM_API_KEY to autoscript/.env, restart the RX Engine, and retry.</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        {hasDocument && (
          <div className={`grid gap-4 lg:h-[560px] lg:grid-cols-2 ${MAIN_COL}`}>
            <DocumentPane rx={rx} />
            {report ? (
              <TranscriptionPane extraction={report.extraction} status={rx.status} />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">{processing ? "Transcription appears here when extraction finishes." : "No transcription available."}</div>
            )}
          </div>
        )}

        <aside aria-label="Patient record" className={SIDE_COL}>
          <PatientContextCard patient={rx.patientContext} documentPatientName={report?.extraction.patientName ?? null} />
        </aside>

        {report && (
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className={MAIN_COL}>
            <TabsList>
              <TabsTrigger value="findings">Findings{findings.length > 0 ? ` (${findings.length})` : ""}</TabsTrigger>
              <TabsTrigger value="entry">
                Entry check
                {entryMismatches > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold tabular-nums text-rose-800">{entryMismatches}</span>}
              </TabsTrigger>
              <TabsTrigger value="review">Review{rx.reviews.length > 0 ? ` (${rx.reviews.length})` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="findings" className="space-y-3 pt-2">
              <FindingsPanel report={report} patientLinked={rx.patientContext !== null} />
            </TabsContent>

            <TabsContent value="entry" className="pt-2">
              <EntryCheckPanel rx={rx} />
            </TabsContent>

            <TabsContent value="review" className="pt-2">
              <div className="max-w-2xl"><ReviewPanel rx={rx} onUpdated={setPrescription} /></div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Review queue
    </Link>
  );
}
