import { PrismaClient } from "@prisma/client";
import { decideDisposition, runRules, RULES_VERSION, normalizeDrugName } from "@autoscript/clinical-rules";
import { SEVERITY_RANK, type AnalysisReport, type ExtractedPrescription, type Finding, type Severity } from "@autoscript/shared";
import { toPatientContext } from "../src/serializers.js";
import { SEED_PATIENTS, SEED_PRESCRIPTIONS, type SeedPatient, type SeedPrescription } from "./seedData.js";

type Log = (msg: string) => void;
const noLog: Log = () => undefined;

function buildExtraction(seed: SeedPrescription, patientName: string | null): ExtractedPrescription {
  return {
    patientName,
    patientDateOfBirth: null,
    prescriberName: seed.prescriberName,
    prescriberIdentifier: null,
    dateWritten: new Date(Date.now() - seed.daysAgo * 86_400_000).toISOString().slice(0, 10),
    medications: seed.medications.map((m) => {
      const generic = normalizeDrugName(m.rawName).generic;
      return {
        rawName: m.rawName,
        normalizedName: generic,
        normalizationSource: generic ? "LOCAL_MAP" : "UNRESOLVED",
        strength: m.strength,
        form: m.form ?? null,
        route: "oral",
        sig: m.sig,
        frequency: m.frequency,
        quantity: m.quantity,
        refills: null,
        duration: null,
        indication: null,
        confidence: 1,
      };
    }),
    statedAllergies: [],
    notes: null,
    uncertainties: [],
    overallConfidence: 1,
    extractor: "seed:hand-structured (not LLM output)",
  };
}

async function createSeedPatient(db: PrismaClient, p: SeedPatient): Promise<void> {
  await db.patient.create({
    data: {
      externalId: p.externalId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
      sex: p.sex,
      phone: p.phone,
      weightKg: p.weightKg,
      renalFunctionNote: p.renalFunctionNote ?? null,
      allergiesVerified: p.allergiesVerified,
      allergies: { create: p.allergies.map((a) => ({ substance: a.substance, reaction: a.reaction ?? null, severity: a.severity ?? "UNKNOWN", recordedAt: a.recordedAt ? new Date(a.recordedAt) : null })) },
      conditions: { create: p.conditions.map((c) => ({ name: c.name, icd10: c.icd10 ?? null, status: c.status ?? "ACTIVE" })) },
      medications: { create: p.medications.map((m) => ({ name: m.name, genericName: m.genericName, dose: m.dose ?? null, frequency: m.frequency ?? null, startedAt: m.startedAt ? new Date(m.startedAt) : null, active: m.active ?? true })) },
    },
  });
}

/** Create any synthetic seed patient whose externalId is missing; existing patients are left untouched. Returns the externalIds created. */
export async function ensureSeedPatients(db: PrismaClient): Promise<string[]> {
  const existing = new Set((await db.patient.findMany({ select: { externalId: true } })).map((p) => p.externalId));
  const created: string[] = [];
  for (const p of SEED_PATIENTS) {
    if (existing.has(p.externalId)) continue;
    await createSeedPatient(db, p);
    created.push(p.externalId);
  }
  return created;
}

/** Insert the historical demo prescriptions (deterministic rules only, no LLM). Requires the seed patients. */
export async function seedHistoricalPrescriptions(db: PrismaClient, log: Log = noLog): Promise<number> {
  for (const seed of SEED_PRESCRIPTIONS) {
    const patient = seed.patientExternalId
      ? await db.patient.findUnique({ where: { externalId: seed.patientExternalId }, include: { allergies: true, conditions: true, medications: true } })
      : null;
    const context = patient ? toPatientContext(patient) : null;
    const extraction = buildExtraction(seed, patient ? `${patient.firstName} ${patient.lastName}` : null);
    const rules = runRules({ extraction, patient: context });
    const findings: Finding[] = rules.findings.map(({ referenceIds: _r, retrievalQuery: _q, ...f }) => ({ ...f, evidence: [], aiContext: null }));
    const decision = decideDisposition({ findings, extraction, patientLinked: !!context, llmCompleted: false });
    const createdAt = new Date(Date.now() - seed.daysAgo * 86_400_000 - 3_600_000);
    const completedAt = new Date(createdAt.getTime() + 40_000);
    const report: AnalysisReport = {
      prescriptionId: "pending",
      disposition: decision.disposition,
      dispositionReason: `${decision.reason} (seeded historical record: deterministic rules only)`,
      extraction,
      findings,
      evidence: [],
      ai: null,
      coverage: {
        rulesEvaluated: rules.rulesEvaluated,
        referenceDocumentsSearched: 0,
        retrievalMethod: "NONE",
        llmUsed: false,
        limitations: ["Seeded demo record generated at seed time by the deterministic rules package; no LLM narrative and no reference retrieval were run.", ...rules.limitations],
      },
      engineVersion: `seed/${RULES_VERSION}`,
      startedAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
    const highest = findings.reduce<Severity | null>((acc, f) => (acc && SEVERITY_RANK[acc] >= SEVERITY_RANK[f.severity] ? acc : f.severity), null);
    const reviewedAt = seed.reviewed ? (seed.reviewedToday ? new Date(Date.now() - 1_800_000) : new Date(createdAt.getTime() + 7_200_000)) : null;

    const rx = await db.prescription.create({
      data: {
        externalRef: seed.externalRef,
        status: decision.disposition,
        reviewStatus: seed.reviewed ? "REVIEWED" : "PENDING_REVIEW",
        sourceType: "TEXT",
        rawText: seed.text,
        patientId: patient?.id ?? null,
        progressStage: "DONE",
        progressMessage: report.dispositionReason,
        progressPercent: 100,
        disposition: decision.disposition,
        findingCount: findings.length,
        highestSeverity: highest,
        medicationSummary: extraction.medications.map((m) => m.normalizedName ?? m.rawName),
        reviewedAt,
        createdAt,
        updatedAt: reviewedAt ?? completedAt,
      },
    });
    await db.prescription.update({ where: { id: rx.id }, data: { report: { ...report, prescriptionId: rx.id } as object } });
    if (seed.reviewed && reviewedAt) {
      if (seed.reviewNotes) {
        await db.review.create({ data: { prescriptionId: rx.id, action: "NOTE", pharmacistName: "R. Patel, PharmD", notes: seed.reviewNotes, createdAt: new Date(reviewedAt.getTime() - 60_000) } });
      }
      await db.review.create({ data: { prescriptionId: rx.id, action: "REVIEWED_NO_INTERVENTION", pharmacistName: "R. Patel, PharmD", notes: null, createdAt: reviewedAt } });
    }
  }
  log(`Seeded ${SEED_PRESCRIPTIONS.length} historical prescriptions`);
  return SEED_PRESCRIPTIONS.length;
}

/** Full reseed: wipes reviews, prescriptions and patients, then recreates them. */
export async function seedDatabase(db: PrismaClient, opts: { log?: Log; patientsOnly?: boolean } = {}): Promise<void> {
  const log = opts.log ?? noLog;
  await db.review.deleteMany();
  await db.prescription.deleteMany();
  await db.patient.deleteMany();

  await ensureSeedPatients(db);
  log(`Seeded ${SEED_PATIENTS.length} patients`);
  if (opts.patientsOnly) {
    log("Skipped historical prescriptions (--patients-only): the queue starts empty");
    return;
  }
  await seedHistoricalPrescriptions(db, log);
}

const isMain = process.argv[1]?.endsWith("seed.ts");
if (isMain) {
  const db = new PrismaClient();
  seedDatabase(db, { log: console.log, patientsOnly: process.argv.includes("--patients-only") })
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
