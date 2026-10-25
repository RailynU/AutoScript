import type { PrescriptionStatus, ReviewStatus } from "@/lib/shared";
import { REVIEW_STATUS_META, STATUS_META, type StatusMeta } from "@/lib/format";
import { cn } from "@/lib/utils";

type BadgeSize = "sm" | "md";

function MetaBadge({ meta, pulse, className, size, title }: { meta: StatusMeta; pulse?: boolean; className?: string; size: BadgeSize; title?: string }) {
  return (
    <span
      title={title ?? meta.description}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        meta.badge,
        className,
      )}
    >
      <span className={cn("relative inline-flex size-1.5 rounded-full", meta.dot)}>
        {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-75", meta.dot)} />}
      </span>
      {meta.label}
    </span>
  );
}

/** Automated screening status (what the RX Engine concluded). */
export function StatusBadge({ status, className, size = "sm" }: { status: PrescriptionStatus; className?: string; size?: BadgeSize }) {
  return <MetaBadge meta={STATUS_META[status]} pulse={status === "PROCESSING"} className={className} size={size} />;
}

/** Pharmacist disposition. Never means "approved for dispensing". */
export function ReviewStatusBadge({ reviewStatus, className, size = "sm" }: { reviewStatus: ReviewStatus; className?: string; size?: BadgeSize }) {
  return <MetaBadge meta={REVIEW_STATUS_META[reviewStatus]} className={className} size={size} />;
}
