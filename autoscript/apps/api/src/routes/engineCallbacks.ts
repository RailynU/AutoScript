import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EngineCallbackSchema, SEVERITY_RANK, type Severity } from "@autoscript/shared";
import type { AppContext } from "../context.js";
import { toListItem } from "../serializers.js";

/** Endpoints the RX Engine calls back into. Local-only, no auth (hackathon scope). */
export async function engineCallbackRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/internal/prescriptions/:id/engine-callback", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const parsed = EngineCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      app.log.warn({ issues: parsed.error.issues.slice(0, 5), prescriptionId: id }, "invalid engine callback");
      return reply.code(400).send({ error: "Invalid callback payload", issues: parsed.error.issues.slice(0, 10) });
    }
    const cb = parsed.data;
    const existing = await ctx.db.prescription.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) return reply.code(404).send({ error: "Prescription not found" });

    if (cb.type === "progress") {
      if (existing.status !== "PROCESSING") return { ignored: true };
      const rx = await ctx.db.prescription.update({
        where: { id },
        data: { progressStage: cb.progress.stage, progressMessage: cb.progress.message, progressPercent: Math.round(cb.progress.percent) },
        include: { patient: true },
      });
      ctx.bus.publish({ type: "progress", prescription: toListItem(rx) });
      return { ok: true };
    }

    if (cb.type === "failed") {
      const rx = await ctx.db.prescription.update({
        where: { id },
        data: { status: "FAILED", progressStage: "FAILED", progressMessage: cb.error, failureReason: `${cb.stage}: ${cb.error}` },
        include: { patient: true },
      });
      ctx.bus.publish({ type: "failed", prescription: toListItem(rx) });
      return { ok: true };
    }

    const report = cb.report;
    const highest = report.findings.reduce<Severity | null>(
      (acc, f) => (acc && SEVERITY_RANK[acc] >= SEVERITY_RANK[f.severity] ? acc : f.severity),
      null,
    );
    const rx = await ctx.db.prescription.update({
      where: { id },
      data: {
        status: report.disposition,
        disposition: report.disposition,
        progressStage: "DONE",
        progressMessage: report.dispositionReason,
        progressPercent: 100,
        report: report as object,
        findingCount: report.findings.length,
        highestSeverity: highest,
        medicationSummary: report.extraction.medications.map((m) => m.normalizedName ?? m.rawName),
        failureReason: null,
      },
      include: { patient: true },
    });
    ctx.bus.publish({ type: "completed", prescription: toListItem(rx) });
    return { ok: true };
  });
}
