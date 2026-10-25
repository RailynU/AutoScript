import { AlertTriangle, CheckCircle2, Keyboard, Loader2 } from "lucide-react";
import type { PrescriptionDetail } from "@/lib/shared";
import { SeverityBadge } from "@/components/SeverityBadge";
import { buildEntryRows, isEntryMismatch } from "@/lib/entryCheck";
import { highestSeverity } from "@/lib/safetySummary";
import { cn } from "@/lib/utils";
import { FindingCard } from "./FindingCard";

/**
 * AutoScript data-entry check: what the technician typed at intake next to what the engine read on
 * the script, with the engine's DATA_ENTRY_MISMATCH findings attached to their rows.
 */
export function EntryCheckPanel({ rx }: { rx: PrescriptionDetail }) {
  const entered = rx.enteredData;
  if (!entered) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
        <Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>No manual entry was captured for this prescription (pasted text, a simulated feed, or the entry step was skipped), so no data-entry comparison ran.</p>
      </div>
    );
  }

  const report = rx.report;
  const findings = report?.findings ?? [];
  const mismatches = findings.filter(isEntryMismatch);
  const rows = buildEntryRows(entered, report?.extraction ?? null, findings);
  const worst = highestSeverity(mismatches);
  const pending = !report;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-xl border p-3.5 text-sm",
          pending ? "bg-card" : mismatches.length > 0 ? "border-rose-200 bg-rose-50/60" : "border-emerald-200 bg-emerald-50/70",
        )}
      >
        {pending ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-sky-600" aria-hidden />
        ) : mismatches.length > 0 ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-700" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        )}
        <p>
          {pending ? (
            "Waiting for the engine to read the script before comparing the entry."
          ) : mismatches.length > 0 ? (
            <>
              <span className="font-semibold">{mismatches.length} entered field{mismatches.length === 1 ? "" : "s"} differ from the script</span>
              {worst && <> (highest <SeverityBadge severity={worst} className="align-middle" />)</>}
              <span className="text-foreground/80">. Correct the entry against the original before filling.</span>
            </>
          ) : (
            <>
              <span className="font-semibold">No entry mismatches detected within checked fields. </span>
              <span className="text-foreground/80">Fields left blank at intake or not readable on the script were not compared.</span>
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[520px] border-collapse text-sm" aria-label="Entered data compared with the script">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th scope="col" className="w-[22%]">Field</th>
              <th scope="col" className="w-[30%]">Entered at intake</th>
              <th scope="col" className="w-[30%]">Read on script</th>
              <th scope="col" className="w-[18%]">Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = r.mismatches.length > 0;
              const compared = r.entered !== null && r.onScript !== null;
              return (
                <tr key={r.field} className={cn("border-t align-top", bad && "bg-rose-50/50")}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">{r.label}</th>
                  <td className={cn("px-3 py-2", !r.entered && "text-muted-foreground")}>{r.entered ?? "not entered"}</td>
                  <td className={cn("px-3 py-2", !r.onScript && "text-muted-foreground")}>{pending ? "…" : (r.onScript ?? "not read")}</td>
                  <td className="px-3 py-2">
                    {pending ? (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    ) : bad ? (
                      <span className="flex flex-wrap items-center gap-1"><SeverityBadge severity={highestSeverity(r.mismatches)} /><span className="text-xs text-rose-800">Mismatch</span></span>
                    ) : compared ? (
                      <span className="text-xs text-emerald-800">No mismatch</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not compared</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mismatches.length > 0 && (
        <section aria-label="Data entry mismatch findings" className="space-y-2">
          <h2 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Data entry mismatch findings <span className="font-normal tabular-nums">({mismatches.length})</span>
          </h2>
          {mismatches.map((f) => <FindingCard key={f.id} finding={f} />)}
        </section>
      )}
    </div>
  );
}
