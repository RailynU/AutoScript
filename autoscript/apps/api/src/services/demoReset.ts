import { rm } from "node:fs/promises";
import path from "node:path";
import type { Db } from "../db.js";
import { ensureSeedPatients, seedHistoricalPrescriptions } from "../../prisma/seed.js";

export interface DemoResetOptions {
  nodeEnv: string;
  withHistory?: boolean;
  log?: (msg: string) => void;
}

export interface DemoResetSummary {
  reviewsDeleted: number;
  prescriptionsDeleted: number;
  filesDeleted: number;
  patientsCreated: string[];
  historicalSeeded: number;
}

async function removeFile(file: string): Promise<boolean> {
  try {
    await rm(file, { force: false });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/** Only files referenced by a prescription row in THIS database are removed; the upload directory is never swept. */
async function deleteUploads(db: Db): Promise<number> {
  const rows = await db.prescription.findMany({ where: { filePath: { not: null } }, select: { filePath: true } });
  let deleted = 0;
  for (const file of new Set(rows.flatMap((r) => (r.filePath ? [path.resolve(r.filePath)] : [])))) if (await removeFile(file)) deleted += 1;
  return deleted;
}

/**
 * Demo reset: delete reviews, prescriptions and the files they reference; keep patients, reference
 * documents and case examples; recreate any missing synthetic patient; optionally reseed
 * the historical prescriptions. Refuses to run in production.
 */
export async function demoReset(db: Db, opts: DemoResetOptions): Promise<DemoResetSummary> {
  if (opts.nodeEnv === "production") throw new Error('demo:reset refuses to run with NODE_ENV="production"');
  const log = opts.log ?? (() => undefined);

  const filesDeleted = await deleteUploads(db);
  const { count: reviewsDeleted } = await db.review.deleteMany();
  const { count: prescriptionsDeleted } = await db.prescription.deleteMany();
  log(`Deleted ${prescriptionsDeleted} prescription(s), ${reviewsDeleted} review(s), ${filesDeleted} uploaded file(s)`);

  const patientsCreated = await ensureSeedPatients(db);
  log(patientsCreated.length ? `Recreated missing seed patient(s): ${patientsCreated.join(", ")}` : "All seed patients present; none recreated");

  const historicalSeeded = opts.withHistory ? await seedHistoricalPrescriptions(db, log) : 0;
  log("Kept: patients, reference_documents / reference_chunks, case_examples");
  return { reviewsDeleted, prescriptionsDeleted, filesDeleted, patientsCreated, historicalSeeded };
}
