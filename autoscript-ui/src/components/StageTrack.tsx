import { PROCESSING_STAGE_ORDER, STAGE_LABELS, type ProcessingStage } from "@/lib/shared";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const VISIBLE = PROCESSING_STAGE_ORDER.filter((s) => s !== "QUEUED" && s !== "DONE");

function indexOf(stage: ProcessingStage): number {
  return (VISIBLE as ProcessingStage[]).indexOf(stage);
}

/** Compact inline track for queue rows: one tick per engine stage. */
export function StageTrackInline({ stage, message, failed }: { stage: ProcessingStage; message: string | null; failed?: boolean }) {
  const current = indexOf(stage);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        {VISIBLE.map((s, i) => {
          const done = stage === "DONE" || i < current;
          const active = i === current && !failed;
          return (
            <span
              key={s}
              title={STAGE_LABELS[s]}
              className={cn(
                "relative h-1.5 flex-1 overflow-hidden rounded-full bg-border transition-colors",
                done && "bg-sky-500",
                active && "as-sweep bg-sky-300",
                failed && i <= current && "bg-rose-400",
              )}
            />
          );
        })}
      </div>
      <span className="truncate text-xs text-muted-foreground">{message ?? STAGE_LABELS[stage]}</span>
    </div>
  );
}

/** Full vertical timeline for the detail page. */
export function StageTimeline({ stage, message, failed }: { stage: ProcessingStage; message: string | null; failed?: boolean }) {
  const current = indexOf(stage);
  return (
    <ol className="space-y-0">
      {VISIBLE.map((s, i) => {
        const done = stage === "DONE" || i < current;
        const active = i === current && !failed && stage !== "DONE";
        const isFailedHere = failed && i === current;
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {i < VISIBLE.length - 1 && <span className={cn("absolute top-5 left-[9px] h-full w-px", done ? "bg-sky-400" : "bg-border")} />}
            <span
              className={cn(
                "relative z-10 grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
                done && "border-sky-500 bg-sky-500 text-white",
                active && "border-sky-500 bg-card text-sky-600",
                isFailedHere && "border-rose-500 bg-rose-500 text-white",
                !done && !active && !isFailedHere && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : active ? <Loader2 className="size-3 animate-spin" /> : isFailedHere ? <X className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 pt-px">
              <p className={cn("text-sm", done || active ? "font-medium text-foreground" : "text-muted-foreground")}>{STAGE_LABELS[s]}</p>
              {(active || isFailedHere) && message && <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
