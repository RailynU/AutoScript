-- Separate the pharmacist disposition (reviewStatus) from the automated screening status (status).

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'INTERVENTION_REQUIRED', 'INTERVENTION_DOCUMENTED', 'INFO_REQUESTED');

-- AlterEnum (PostgreSQL 12+: several ADD VALUE statements in one migration are fine; none of the
-- new values is used further down in this migration)
ALTER TYPE "ReviewAction" ADD VALUE 'PRESCRIBER_CONTACTED';
ALTER TYPE "ReviewAction" ADD VALUE 'INFO_REQUESTED';
ALTER TYPE "ReviewAction" ADD VALUE 'INTERVENTION_DOCUMENTED';
ALTER TYPE "ReviewAction" ADD VALUE 'REVIEWED_NO_INTERVENTION';
ALTER TYPE "ReviewAction" ADD VALUE 'INTERVENTION_REQUIRED';
ALTER TYPE "ReviewAction" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- Backfill.
-- Predicate: "status" = 'REVIEWED' (the legacy combined value; the only rows whose status ever
-- encoded a pharmacist decision). For every such row:
--   * "reviewStatus" becomes REVIEWED;
--   * "status" is restored to the screening result stored in the report, "report"->>'disposition',
--     when that value is MANUAL_REVIEW_NEEDED or NO_FLAGS_DETECTED; otherwise (no report, or any
--     other disposition) "status" is left as REVIEWED, which the application still reads.
-- Rows with any other status are not touched and keep the column default PENDING_REVIEW.
UPDATE "Prescription"
SET "reviewStatus" = 'REVIEWED',
    "status" = CASE
      WHEN "report"->>'disposition' IN ('MANUAL_REVIEW_NEEDED', 'NO_FLAGS_DETECTED')
        THEN ("report"->>'disposition')::"PrescriptionStatus"
      ELSE "status"
    END
WHERE "status" = 'REVIEWED';

-- CreateIndex
CREATE INDEX "Prescription_reviewStatus_idx" ON "Prescription"("reviewStatus");
