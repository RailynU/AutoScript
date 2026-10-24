import { severityMeta } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SeverityBadge({ severity, className }: { severity: string | null | undefined; className?: string }) {
  const meta = severityMeta(severity);
  if (!meta) return null;
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset", meta.badge, className)}>
      {meta.label}
    </span>
  );
}
