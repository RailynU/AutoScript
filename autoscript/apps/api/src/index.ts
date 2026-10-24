import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const app = await buildServer({ env });
try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`AutoScript API listening on ${env.API_URL} (engine: ${env.RX_ENGINE_URL})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
