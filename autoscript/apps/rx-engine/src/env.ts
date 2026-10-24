import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  RX_ENGINE_PORT: z.coerce.number().default(4210),
  LLM_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("google/gemini-2.5-flash"),
  LLM_VISION_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(90_000),
  /** Hard per-analysis deadline; must stay below the API's PROCESSING_TIMEOUT_MS so the engine reports the failure first. */
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().positive().default(150_000),
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

const PLACEHOLDER_KEYS = new Set(["", "sk-or-v1-replace-me", "replace-me", "changeme"]);

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid RX Engine environment: ${issues}`);
  }
  const env = parsed.data;
  return {
    ...env,
    LLM_API_KEY: env.LLM_API_KEY && !PLACEHOLDER_KEYS.has(env.LLM_API_KEY.trim()) ? env.LLM_API_KEY.trim() : undefined,
    LLM_VISION_MODEL: env.LLM_VISION_MODEL || env.LLM_MODEL,
    EMBEDDING_API_KEY: env.EMBEDDING_API_KEY && !PLACEHOLDER_KEYS.has(env.EMBEDDING_API_KEY.trim()) ? env.EMBEDDING_API_KEY.trim() : undefined,
  };
}
