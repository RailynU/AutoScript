import type { FastifyBaseLogger } from "fastify";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import type { PrescriptionEventBus } from "./events.js";
import type { EngineClient } from "./services/engineClient.js";
import type { IntakeDeps } from "./services/intake.js";

export interface AppContext {
  env: Env;
  db: Db;
  bus: PrescriptionEventBus;
  engine: EngineClient;
  intakeDeps: IntakeDeps;
  log: FastifyBaseLogger;
}
