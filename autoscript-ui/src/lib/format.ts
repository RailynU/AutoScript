import { formatDistanceToNowStrict, format, differenceInYears, parseISO } from "date-fns";
import type { PrescriptionStatus, ReviewKind, ReviewStatus, Severity } from "@/lib/shared";

export function timeAgo(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function dateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy 'at' HH:mm");
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  return differenceInYears(new Date(), parseISO(dob));
}

export interface StatusMeta {
  label: string;
  short: string;
  /** Tailwind classes for the badge surface. */
  badge: string;
  dot: string;
  description: string;
}

export const STATUS_META: Record<PrescriptionStatus, StatusMeta> = {
  PROCESSING: {
    label: "Processing",
    short: "Processing",
    badge: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-800",
    dot: "bg-sky-500",
    description: "The RX Engine is extracting and analyzing this prescription.",
  },
  MANUAL_REVIEW_NEEDED: {
    label: "Manual review needed",
    short: "Review",
    badge: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-800",
    dot: "bg-amber-500",
    description: "At least one finding or gap requires a pharmacist's judgment.",
  },
  NO_FLAGS_DETECTED: {
    label: "No flags detected",
    short: "No flags",
    badge: "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800",
    dot: "bg-emerald-500",
    description: "No flags within checked criteria. A pharmacist still completes the review.",
  },
  REVIEWED: {
    label: "Reviewed (legacy)",
    short: "Reviewed",
    badge: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    dot: "bg-slate-500",
    description: "Legacy value from before screening and review status were separated. No screening result is stored for this row.",
  },
  FAILED: {
    label: "Failed",
    short: "Failed",
    badge: "bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-100 dark:ring-rose-800",
    dot: "bg-rose-500",
    description: "Processing failed. The error is recorded on the prescription.",
  },
};

/** Pharmacist disposition chip. None of these means "approved for dispensing". */
export const REVIEW_STATUS_META = {
  PENDING_REVIEW: {
    label: "Pending review",
    short: "Pending",
    badge: "bg-transparent text-muted-foreground ring-border",
    dot: "bg-slate-400",
    description: "No pharmacist disposition has been recorded yet.",
  },
  INFO_REQUESTED: {
    label: "Info requested",
    short: "Info",
    badge: "bg-violet-50 text-violet-900 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-100 dark:ring-violet-800",
    dot: "bg-violet-500",
    description: "Waiting on the prescriber or patient for more information.",
  },
  INTERVENTION_REQUIRED: {
    label: "Intervention required",
    short: "Intervene",
    badge: "bg-orange-50 text-orange-900 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-100 dark:ring-orange-800",
    dot: "bg-orange-500",
    description: "The pharmacist decided an intervention is needed; it is not documented yet.",
  },
  INTERVENTION_DOCUMENTED: {
    label: "Intervention documented",
    short: "Documented",
    badge: "bg-teal-50 text-teal-900 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-100 dark:ring-teal-800",
    dot: "bg-teal-500",
    description: "An intervention was carried out and documented. This is not a dispensing approval.",
  },
  REVIEWED: {
    label: "Reviewed",
    short: "Reviewed",
    badge: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    dot: "bg-slate-500",
    description: "A pharmacist completed the review without an intervention. This is not a dispensing approval.",
  },
} satisfies Record<ReviewStatus, StatusMeta>;

export interface ReviewKindMeta {
  /** Select option label. */
  label: string;
  /** History line, e.g. "requested information". */
  past: string;
  /** Shown under the select. */
  help: string;
  /** Hidden from the action select (legacy kinds still render in history). */
  legacy?: boolean;
}

export const REVIEW_KIND_META: Record<ReviewKind, ReviewKindMeta> = {
  NOTE: { label: "Add a note", past: "added a note", help: "Records a note. The review status does not change." },
  MARK_REVIEWED: { label: "Mark reviewed", past: "marked this reviewed", help: "Legacy action; same effect as “Reviewed, no intervention”.", legacy: true },
  PRESCRIBER_CONTACTED: { label: "Prescriber contacted", past: "contacted the prescriber", help: "Records the contact and sets the status to Info requested until a later action changes it." },
  INFO_REQUESTED: { label: "Information requested", past: "requested information", help: "Sets the status to Info requested." },
  INTERVENTION_REQUIRED: { label: "Intervention required", past: "flagged an intervention as required", help: "Sets the status to Intervention required." },
  INTERVENTION_DOCUMENTED: { label: "Intervention documented", past: "documented an intervention", help: "Completes the review with a documented intervention." },
  REVIEWED_NO_INTERVENTION: { label: "Reviewed, no intervention", past: "completed the review with no intervention", help: "Completes the review. This is not a dispensing approval." },
  OTHER: { label: "Other (note required)", past: "recorded an action", help: "Any other action. A note is required; the review status does not change." },
};

export interface SeverityMeta {
  label: string;
  badge: string;
  bar: string;
  rank: number;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  CRITICAL: { label: "Critical", badge: "bg-rose-600 text-white ring-rose-700", bar: "bg-rose-600", rank: 5 },
  HIGH: { label: "High", badge: "bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100", bar: "bg-orange-500", rank: 4 },
  MODERATE: { label: "Moderate", badge: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100", bar: "bg-amber-400", rank: 3 },
  LOW: { label: "Low", badge: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100", bar: "bg-sky-400", rank: 2 },
  INFO: { label: "Info", badge: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200", bar: "bg-slate-400", rank: 1 },
};

export function severityMeta(value: string | null | undefined): SeverityMeta | null {
  if (!value) return null;
  return (SEVERITY_META as Record<string, SeverityMeta>)[value] ?? null;
}

export const FINDING_TYPE_LABEL: Record<string, string> = {
  DRUG_INTERACTION: "Drug interaction",
  ALLERGY_CONFLICT: "Allergy conflict",
  MISSING_PATIENT_INFO: "Missing patient information",
  MISSING_PRESCRIPTION_INFO: "Incomplete prescription",
  DUPLICATE_THERAPY: "Duplicate therapy",
  DOSE_CONCERN: "Dose concern",
  CONDITION_CONFLICT: "Condition conflict",
  EXTRACTION_UNCERTAINTY: "Extraction uncertainty",
  AI_OBSERVATION: "AI observation",
  SYSTEM_LIMITATION: "System limitation",
  DATA_ENTRY_MISMATCH: "Data entry mismatch",
};

export function patientName(p: { firstName: string; lastName: string } | null): string {
  return p ? `${p.firstName} ${p.lastName}` : "No patient linked";
}

export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone;
}
