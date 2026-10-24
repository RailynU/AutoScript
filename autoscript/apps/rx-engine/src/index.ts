import { loadEnv } from "./env.js";
import { buildEngineServer } from "./server.js";

const env = loadEnv();
const app = await buildEngineServer(env);
if (!env.LLM_API_KEY) {
  app.log.warn("LLM_API_KEY is not set: every analysis will fail with an explicit 'LLM provider is not configured' error until you add one to .env");
}
try {
  await app.listen({ port: env.RX_ENGINE_PORT, host: "0.0.0.0" });
  app.log.info(`RX Engine listening on :${env.RX_ENGINE_PORT} (model ${env.LLM_MODEL}, vision ${env.LLM_VISION_MODEL})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
