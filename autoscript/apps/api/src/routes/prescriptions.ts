import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateTextPrescriptionSchema, EnteredScriptDataSchema, PrescriptionStatus, ReviewStatus, findScenario, DEMO_SCENARIOS, type EnteredScriptData } from "@autoscript/shared";
import type { AppContext } from "../context.js";
import { toDetail, toListItem } from "../serializers.js";
import { createPrescription, dispatchToEngine, sourceTypeForMime } from "../services/intake.js";
import { toScriptData } from "../services/scriptData.js";

const ListQuery = z.object({
  status: PrescriptionStatus.optional(),
  reviewStatus: ReviewStatus.optional(),
  limit: z.coerce.number().min(1).max(200).default(100),
});

export async function prescriptionRoutes(app: FastifyInstance, ctx: AppContext) {
  const deps = ctx.intakeDeps;

  app.get("/prescriptions", async (req) => {
    const { status, reviewStatus, limit } = ListQuery.parse(req.query);
    const rows = await ctx.db.prescription.findMany({
      where: { ...(status ? { status } : {}), ...(reviewStatus ? { reviewStatus } : {}) },
      include: { patient: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { prescriptions: rows.map(toListItem) };
  });

  app.get("/prescriptions/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const rx = await ctx.db.prescription.findUnique({
      where: { id },
      include: {
        patient: { include: { allergies: true, conditions: true, medications: true } },
        reviews: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!rx) return reply.code(404).send({ error: "Prescription not found" });
    return { prescription: toDetail(rx) };
  });

  app.get("/prescriptions/:id/file", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const rx = await ctx.db.prescription.findUnique({ where: { id }, select: { filePath: true, mimeType: true, fileName: true } });
    if (!rx?.filePath || !rx.mimeType) return reply.code(404).send({ error: "No file for this prescription" });
    reply.header("content-type", rx.mimeType);
    reply.header("content-disposition", `inline; filename="${rx.fileName ?? "prescription"}"`);
    return reply.send(createReadStream(rx.filePath));
  });

  /** JSON body: pasted prescription text. */
  app.post("/prescriptions/text", async (req, reply) => {
    const body = CreateTextPrescriptionSchema.parse(req.body);
    const rx = await createPrescription(deps, { kind: "text", text: body.text, patientId: body.patientId ?? null });
    return reply.code(202).send({ prescription: toListItem(rx) });
  });

  /** multipart/form-data: file + optional patientId and enteredData (JSON) fields. */
  app.post("/prescriptions/upload", async (req, reply) => {
    const parts = req.parts();
    let file: { fileName: string; mimeType: string; buffer: Buffer } | null = null;
    let patientId: string | null = null;
    let enteredData: EnteredScriptData | null = null;
    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        file = { fileName: part.filename, mimeType: part.mimetype, buffer };
      } else if (part.fieldname === "patientId" && typeof part.value === "string" && part.value) {
        patientId = part.value;
      } else if (part.fieldname === "enteredData" && typeof part.value === "string" && part.value) {
        let json: unknown;
        try {
          json = JSON.parse(part.value);
        } catch {
          return reply.code(400).send({ error: "enteredData must be JSON" });
        }
        enteredData = EnteredScriptDataSchema.parse(json);
      }
    }
    if (!file) return reply.code(400).send({ error: "No file uploaded" });
    if (!sourceTypeForMime(file.mimeType)) return reply.code(415).send({ error: `Unsupported file type ${file.mimeType}. Use PDF, JPG or PNG.` });
    if (file.buffer.length === 0) return reply.code(400).send({ error: "Uploaded file is empty" });
    const rx = await createPrescription(deps, { kind: "file", ...file, patientId, enteredData });
    return reply.code(202).send({ prescription: toListItem(rx) });
  });

  /** multipart/form-data: file. Reads the script without screening it and returns form-ready fields (autofill). */
  app.post("/prescriptions/extract", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(422).send({ code: "FILE_MISSING", error: "No script image was provided." });
    const buffer = await file.toBuffer();
    if (buffer.length === 0) return reply.code(422).send({ code: "FILE_MISSING", error: "No script image was provided." });
    if (!sourceTypeForMime(file.mimetype)) return reply.code(422).send({ code: "UNSUPPORTED_FORMAT", error: "The script image must be a JPEG, PNG, or PDF file." });
    if (!ctx.engine.extract) return reply.code(501).send({ error: "Autofill is not available" });
    try {
      const extraction = await ctx.engine.extract({ fileName: file.filename, mimeType: file.mimetype, base64: buffer.toString("base64") });
      return { scriptData: toScriptData(extraction), extraction };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ err: message }, "autofill extract failed");
      return reply.code(502).send({ code: "EXTRACTION_FAILED", error: `Could not read the script: ${message}` });
    }
  });

  /** Simulated incoming event (e.g. e-prescription feed) using a synthetic scenario. */
  app.get("/scenarios", async () => ({
    scenarios: DEMO_SCENARIOS.map(({ key, title, description, patientExternalId, expectedOutcome }) => ({ key, title, description, patientExternalId, expectedOutcome })),
  }));

  app.post("/prescriptions/simulate", async (req, reply) => {
    const { scenarioKey } = z.object({ scenarioKey: z.string() }).parse(req.body);
    const scenario = findScenario(scenarioKey);
    if (!scenario) return reply.code(404).send({ error: `Unknown scenario ${scenarioKey}` });
    let patientId: string | null = null;
    if (scenario.patientExternalId) {
      const patient = await ctx.db.patient.findUnique({ where: { externalId: scenario.patientExternalId }, select: { id: true } });
      if (!patient) return reply.code(409).send({ error: `Seed patient ${scenario.patientExternalId} missing; run db:seed` });
      patientId = patient.id;
    }
    const rx = await createPrescription(deps, { kind: "text", text: scenario.text, patientId, sourceType: "SIMULATED" });
    return reply.code(202).send({ prescription: toListItem(rx) });
  });

  /** Re-dispatch a FAILED (or stuck) prescription to the engine. */
  app.post("/prescriptions/:id/retry", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const existing = await ctx.db.prescription.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Prescription not found" });
    const rx = await ctx.db.prescription.update({
      where: { id },
      data: { status: "PROCESSING", progressStage: "QUEUED", progressMessage: "Re-queued", progressPercent: 2, failureReason: null },
      include: { patient: true },
    });
    ctx.bus.publish({ type: "created", prescription: toListItem(rx) });
    void dispatchToEngine(deps, id).catch((err) => app.log.error({ err }, "retry dispatch failed"));
    return reply.code(202).send({ prescription: toListItem(rx) });
  });
}
