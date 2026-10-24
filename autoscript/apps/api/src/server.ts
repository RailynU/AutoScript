import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import type { AppContext } from "./context.js";
import { createPrisma, type Db } from "./db.js";
import type { Env } from "./env.js";
import { PrescriptionEventBus } from "./events.js";
import { engineCallbackRoutes } from "./routes/engineCallbacks.js";
import { eventRoutes } from "./routes/events.js";
import { patientRoutes } from "./routes/patients.js";
import { prescriptionRoutes } from "./routes/prescriptions.js";
import { reviewRoutes } from "./routes/reviews.js";
import { statsRoutes } from "./routes/stats.js";
import { HttpEngineClient, type EngineClient } from "./services/engineClient.js";
import { startStaleSweeper } from "./services/staleSweeper.js";

export interface BuildOptions {
  env: Env;
  db?: Db;
  engine?: EngineClient;
  logger?: boolean;
  /** Start the stale-PROCESSING sweeper (startup + every STALE_SWEEP_INTERVAL_MS). Default true. */
  sweeper?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

interface HttpError {
  statusCode?: unknown;
  message?: unknown;
}

/** Status + body for the generic error handler: 4xx keep their message, 5xx never leak details. */
export function toErrorResponse(err: unknown): { status: number; body: { error: string } } {
  const raw = (err as HttpError)?.statusCode;
  const status = typeof raw === "number" && raw >= 400 && raw < 600 ? raw : 500;
  if (status >= 500) return { status, body: { error: "Internal server error" } };
  const message = err instanceof Error ? err.message : typeof (err as HttpError)?.message === "string" ? String((err as HttpError).message) : "Request failed";
  return { status, body: { error: message } };
}

export async function buildServer(opts: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 25 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  const db = opts.db ?? createPrisma(opts.env.DATABASE_URL);
  const bus = new PrescriptionEventBus();
  const engine = opts.engine ?? new HttpEngineClient(opts.env.RX_ENGINE_URL);
  const ctx: AppContext = {
    env: opts.env,
    db,
    bus,
    engine,
    log: app.log,
    intakeDeps: { db, bus, engine, uploadDir: opts.env.UPLOAD_DIR, apiUrl: opts.env.API_URL, log: app.log },
  };

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const { status, body } = toErrorResponse(err);
    if (status >= 500) app.log.error({ err, method: req.method, url: req.url }, "unhandled error");
    return reply.code(status).send(body);
  });

  const health = async () => ({ ok: true, engine: await engine.health() });
  app.get("/health", health);
  // Every AutoScript endpoint lives under /api (the React client and Vite proxy call /api/*).
  await app.register(
    async (api) => {
      api.get("/health", health);
      await patientRoutes(api, ctx);
      await prescriptionRoutes(api, ctx);
      await reviewRoutes(api, ctx);
      await statsRoutes(api, ctx);
      await engineCallbackRoutes(api, ctx);
      await eventRoutes(api, ctx);
    },
    { prefix: "/api" },
  );

  const stopSweeper =
    opts.sweeper === false
      ? null
      : startStaleSweeper({ db, bus, log: app.log }, { timeoutMs: opts.env.PROCESSING_TIMEOUT_MS, intervalMs: opts.env.STALE_SWEEP_INTERVAL_MS });

  app.addHook("onClose", async () => {
    stopSweeper?.();
    if (!opts.db) await db.$disconnect();
  });

  app.decorate("ctx", ctx);
  return app;
}
