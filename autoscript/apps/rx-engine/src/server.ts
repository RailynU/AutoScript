import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { AnalyzeRequestSchema, type EngineCallback } from "@autoscript/shared";
import { extractPrescription } from "./extraction/extract.js";
import type { Env } from "./env.js";
import { OpenAiCompatibleClient, type LlmClient } from "./llm/client.js";
import { createRagPool, ensureRagSchema, type RagPool } from "./rag/db.js";
import { Retriever } from "./rag/retrieve.js";
import { runPipeline } from "./pipeline.js";

export function createLlmClient(env: Env): LlmClient {
  return new OpenAiCompatibleClient({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    visionModel: env.LLM_VISION_MODEL ?? env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    embedding: env.EMBEDDING_MODEL
      ? { baseUrl: env.EMBEDDING_BASE_URL ?? env.LLM_BASE_URL, apiKey: env.EMBEDDING_API_KEY ?? env.LLM_API_KEY, model: env.EMBEDDING_MODEL }
      : undefined,
  });
}

/** POST the callback to the API; retried a few times because the API may be mid-reload in dev. */
async function postCallback(url: string, body: EngineCallback, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      if (res.ok) return;
      lastError = new Error(`callback ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (res.status >= 400 && res.status < 500) break;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function buildEngineServer(env: Env, overrides: { llm?: LlmClient; pool?: RagPool } = {}) {
  const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) app.log.error({ err, method: req.method, url: req.url }, "unhandled error");
    return reply.code(status).send({ error: status >= 500 ? "Internal server error" : err.message });
  });
  const llm = overrides.llm ?? createLlmClient(env);
  const pool = overrides.pool ?? createRagPool(env.DATABASE_URL);
  await ensureRagSchema(pool);
  const retriever = new Retriever(pool, llm);
  const active = new Set<string>();

  app.get("/health", async () => ({
    ok: true,
    llmConfigured: llm.configured,
    model: llm.model,
    visionModel: llm.visionModel,
    referenceDocuments: await retriever.documentCount(),
    activeJobs: active.size,
  }));

  app.get("/references", async () => {
    const res = await pool.query(`SELECT d.id, d.title, d.source, d.url, d.publisher, d.year, d.kind, count(c.id)::int AS chunks, bool_or(c.embedding IS NOT NULL) AS embedded
      FROM reference_documents d LEFT JOIN reference_chunks c ON c.document_id = d.id GROUP BY d.id ORDER BY d.id`);
    return { references: res.rows };
  });

  app.post("/analyze", async (req, reply) => {
    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid analyze request", issues: parsed.error.issues.slice(0, 10) });
    const request = parsed.data;
    if (active.has(request.prescriptionId)) return reply.code(409).send({ error: "Already processing" });
    active.add(request.prescriptionId);
    const send = (cb: EngineCallback) => postCallback(request.callbackUrl, cb).catch((err) => app.log.error({ err, prescriptionId: request.prescriptionId, type: cb.type }, "callback delivery failed"));
    setImmediate(() => {
      runPipeline({ llm, retriever, send, log: app.log }, request, { timeoutMs: env.ANALYSIS_TIMEOUT_MS }).finally(() => active.delete(request.prescriptionId));
    });
    return reply.code(202).send({ accepted: true, prescriptionId: request.prescriptionId, llmConfigured: llm.configured });
  });

  /** Extraction only (no rules, no callback): powers AutoScript's "Autofill from image". */
  const ExtractRequest = z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string().min(1) });
  app.post("/extract", async (req, reply) => {
    const parsed = ExtractRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid extract request" });
    if (!llm.configured) return reply.code(503).send({ error: "LLM is not configured (set LLM_API_KEY)." });
    try {
      const extraction = await extractPrescription(llm, { kind: "file", ...parsed.data });
      return { extraction };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ err: message }, "extract failed");
      return reply.code(502).send({ error: message });
    }
  });

  app.addHook("onClose", async () => {
    if (!overrides.pool) await pool.end();
  });
  return app;
}
