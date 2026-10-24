import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().default(8080),
  API_URL: z.string().url().default("http://localhost:8080"),
  RX_ENGINE_URL: z.string().url().default("http://localhost:4210"),
  UPLOAD_DIR: z.string().default("./uploads"),
  NODE_ENV: z.string().default("development"),
  /** A prescription still PROCESSING with no engine update for this long is marked FAILED (keep above the engine's ANALYSIS_TIMEOUT_MS). */
  PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  /** How often the stale-PROCESSING sweeper runs (it also runs once at startup). */
  STALE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API environment: ${issues}`);
  }
  return parsed.data;
}
