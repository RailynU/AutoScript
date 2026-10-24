import type { Prisma } from "@prisma/client";
import {
  REVIEW_COMPLETING_STATUSES,
  REVIEW_KIND_TRANSITIONS,
  type ReviewKind,
  type ReviewStatus,
} from "@autoscript/shared";

/** Prescription fields a review action changes, derived from the closed-set transition map. */
export function prescriptionUpdateForReview(kind: ReviewKind, now: Date): Prisma.PrescriptionUpdateInput {
  const next: ReviewStatus | null = REVIEW_KIND_TRANSITIONS[kind];
  if (next === null) return {};
  return REVIEW_COMPLETING_STATUSES[next] ? { reviewStatus: next, reviewedAt: now } : { reviewStatus: next };
}
