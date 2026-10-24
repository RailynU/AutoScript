import type { FastifyInstance } from "fastify";
import type { DashboardStats, PrescriptionStatus, ReviewStatus } from "@autoscript/shared";
import type { AppContext } from "../context.js";

/** One stats field per screening status; adding a status without a field fails typecheck. */
const SCREENING_FIELDS = {
  PROCESSING: "processing",
  MANUAL_REVIEW_NEEDED: "manualReviewNeeded",
  NO_FLAGS_DETECTED: "noFlagsDetected",
  FAILED: "failed",
  /** Legacy combined value: counted nowhere but in `total`. */
  REVIEWED: null,
} as const satisfies Record<PrescriptionStatus, keyof DashboardStats | null>;

/** One stats field per review status; adding a status without a field fails typecheck. */
const REVIEW_FIELDS = {
  PENDING_REVIEW: "pendingReview",
  INTERVENTION_REQUIRED: "interventionRequired",
  INFO_REQUESTED: "infoRequested",
  INTERVENTION_DOCUMENTED: "interventionDocumented",
  REVIEWED: "reviewed",
} as const satisfies Record<ReviewStatus, keyof DashboardStats>;

type CountEntry = readonly [field: keyof DashboardStats, count: number];

function entries<K extends string>(fields: Record<K, keyof DashboardStats | null>): Array<[K, keyof DashboardStats]> {
  return (Object.entries(fields) as Array<[K, keyof DashboardStats | null]>).filter((e): e is [K, keyof DashboardStats] => e[1] !== null);
}

export async function statsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/stats", async (): Promise<DashboardStats> => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const screening = entries<PrescriptionStatus>(SCREENING_FIELDS).map(
      async ([status, field]): Promise<CountEntry> => [field, await ctx.db.prescription.count({ where: { status } })],
    );
    const review = entries<ReviewStatus>(REVIEW_FIELDS).map(
      async ([reviewStatus, field]): Promise<CountEntry> => [field, await ctx.db.prescription.count({ where: { reviewStatus } })],
    );
    const [counts, reviewedToday, total] = await Promise.all([
      Promise.all([...screening, ...review]),
      ctx.db.prescription.count({ where: { reviewedAt: { gte: startOfDay } } }),
      ctx.db.prescription.count(),
    ]);
    const byField = Object.fromEntries(counts) as Record<keyof DashboardStats, number>;
    return { ...byField, reviewedToday, total };
  });
}
