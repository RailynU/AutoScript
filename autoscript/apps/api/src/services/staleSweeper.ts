import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db.js";
import type { PrescriptionEventBus } from "../events.js";
import { toListItem } from "../serializers.js";

export interface SweeperDeps {
  db: Db;
  bus: PrescriptionEventBus;
  log: FastifyBaseLogger;
}

export function timeoutReason(timeoutMs: number): string {
  return `Analysis timed out after ${Math.round(timeoutMs / 1000)} s; retry from the detail page`;
}

/**
 * Mark prescriptions that have been PROCESSING with no engine update for longer than
 * `timeoutMs` as FAILED and publish the SSE "failed" event for each. Staleness is measured
 * on `updatedAt`, which every progress callback bumps, so a job that is still reporting
 * progress is never swept. Each row is claimed with a status-guarded update so a result
 * callback that lands in the same instant wins and the row is left alone.
 * Returns the ids that were marked.
 */
export async function sweepStaleProcessing(deps: SweeperDeps, timeoutMs: number, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - timeoutMs);
  const candidates = await deps.db.prescription.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: cutoff } },
    select: { id: true, updatedAt: true },
  });
  const reason = timeoutReason(timeoutMs);
  const marked: string[] = [];
  for (const { id, updatedAt } of candidates) {
    const claimed = await deps.db.prescription.updateMany({
      where: { id, status: "PROCESSING", updatedAt },
      data: { status: "FAILED", progressStage: "FAILED", progressMessage: reason, failureReason: reason },
    });
    if (claimed.count !== 1) continue;
    const rx = await deps.db.prescription.findUnique({ where: { id }, include: { patient: true } });
    if (!rx) continue;
    deps.bus.publish({ type: "failed", prescription: toListItem(rx) });
    deps.log.warn({ prescriptionId: id, staleSince: updatedAt.toISOString(), timeoutMs }, "stale PROCESSING prescription marked FAILED");
    marked.push(id);
  }
  return marked;
}

/** Run the sweep now and then every `intervalMs`; returns a stop function. Errors are logged, never thrown. */
export function startStaleSweeper(deps: SweeperDeps, opts: { timeoutMs: number; intervalMs: number }): () => void {
  const run = () =>
    sweepStaleProcessing(deps, opts.timeoutMs).catch((err) => deps.log.error({ err }, "stale PROCESSING sweep failed"));
  void run();
  const timer = setInterval(run, opts.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
