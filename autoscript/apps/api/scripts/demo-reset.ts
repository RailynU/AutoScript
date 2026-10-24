import { createPrisma } from "../src/db.js";
import { loadEnv } from "../src/env.js";
import { demoReset } from "../src/services/demoReset.js";

const env = loadEnv();
const withHistory = process.argv.includes("--with-history");
const db = createPrisma(env.DATABASE_URL);
try {
  console.log(`demo:reset against ${new URL(env.DATABASE_URL).pathname.slice(1)} (NODE_ENV=${env.NODE_ENV}${withHistory ? ", with history" : ""})`);
  await demoReset(db, { nodeEnv: env.NODE_ENV, withHistory, log: console.log });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
