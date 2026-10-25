
import { useState } from "react";
import type { PrescriptionDetail } from "@/lib/shared";
import { ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Left pane: the original prescription exactly as received. */
export function DocumentPane({ rx }: { rx: PrescriptionDetail }) {
  const [zoom, setZoom] = useState(1);
  const fileUrl = api.fileUrl(rx.id);
  const label = rx.sourceType === "SIMULATED" ? "Incoming e-prescription (simulated)" : rx.sourceType === "TEXT" ? "Pasted text" : rx.fileName ?? "Uploaded file";

  return (
    <section aria-label="Original prescription" className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Original</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-1">
          {rx.sourceType === "IMAGE" && (
            <>
              <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ZoomOut className="size-4" /></button>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ZoomIn className="size-4" /></button>
            </>
          )}
          {rx.fileName && (
            <a href={fileUrl} target="_blank" rel="noreferrer" aria-label="Open original in a new tab" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-4" /></a>
          )}
        </div>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto bg-muted/30", rx.sourceType === "IMAGE" ? "p-2" : "p-0")}>
        {rx.sourceType === "IMAGE" ? (
          <img src={fileUrl} alt={`Uploaded prescription ${rx.fileName ?? ""}`} style={{ width: `${zoom * 100}%` }} className="max-w-none rounded-md border bg-white shadow-sm" />
        ) : rx.sourceType === "PDF" ? (
          <iframe title="Prescription PDF" src={fileUrl} className="h-full min-h-[520px] w-full bg-white" />
        ) : (
          <pre className="min-h-full p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{rx.rawText}</pre>
        )}
      </div>
    </section>
  );
}
