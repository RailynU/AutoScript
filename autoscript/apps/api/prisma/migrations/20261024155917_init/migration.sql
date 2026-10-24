-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('PROCESSING', 'MANUAL_REVIEW_NEEDED', 'NO_FLAGS_DETECTED', 'REVIEWED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PDF', 'IMAGE', 'TEXT', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('NOTE', 'MARK_REVIEWED');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "sex" TEXT,
    "phone" TEXT,
    "weightKg" DOUBLE PRECISION,
    "renalFunctionNote" TEXT,
    "allergiesVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "recordedAt" DATE,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icd10" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedication" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "dose" TEXT,
    "frequency" TEXT,
    "startedAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'PROCESSING',
    "sourceType" "SourceType" NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "mimeType" TEXT,
    "rawText" TEXT,
    "patientId" TEXT,
    "progressStage" TEXT NOT NULL DEFAULT 'QUEUED',
    "progressMessage" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "report" JSONB,
    "disposition" TEXT,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "highestSeverity" TEXT,
    "medicationSummary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "pharmacistName" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_externalId_key" ON "Patient"("externalId");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_externalRef_key" ON "Prescription"("externalRef");

-- CreateIndex
CREATE INDEX "Prescription_status_idx" ON "Prescription"("status");

-- CreateIndex
CREATE INDEX "Prescription_createdAt_idx" ON "Prescription"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_prescriptionId_createdAt_idx" ON "Review"("prescriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
