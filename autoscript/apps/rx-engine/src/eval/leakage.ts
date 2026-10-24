import { createHash } from "node:crypto";
import type { RagPool } from "../rag/db.js";
import type { EvalCase, LeakageResult } from "./types.js";

/** What the check reads from case_examples: the example id, the image hash and the ground truth stored in its payload. */
export interface ExampleRow {
  id: string;
  payloadId: string | null;
  sha256: string | null;
  groundTruthFingerprint: string | null;
}

export interface EvalFingerprint {
  id: string;
  sha256: string | null;
  groundTruthFingerprint: string | null;
}

/** JSON with recursively sorted keys, so a JSONB round trip (which reorders keys) hashes the same as the original. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function evalFingerprint(c: EvalCase): EvalFingerprint {
  return { id: c.id, sha256: c.image?.sha256 ?? null, groundTruthFingerprint: c.groundTruth ? fingerprint(c.groundTruth) : null };
}

/** Pure comparison: which eval cases collide with an ingested example by id, image hash or ground-truth content. */
export function findLeaks(rows: ExampleRow[], cases: EvalFingerprint[]): Pick<LeakageResult, "idCollisions" | "sha256Collisions" | "groundTruthCollisions"> {
  const ids = new Set(rows.flatMap((r) => [r.id, r.payloadId].filter((x): x is string => x != null)));
  const hashes = new Set(rows.map((r) => r.sha256).filter((x): x is string => x != null));
  const truths = new Set(rows.map((r) => r.groundTruthFingerprint).filter((x): x is string => x != null));
  return {
    idCollisions: cases.filter((c) => ids.has(c.id)).map((c) => c.id),
    sha256Collisions: cases.filter((c) => c.sha256 != null && hashes.has(c.sha256)).map((c) => c.id),
    groundTruthCollisions: cases.filter((c) => c.groundTruthFingerprint != null && truths.has(c.groundTruthFingerprint)).map((c) => c.id),
  };
}

interface DbRow {
  id: string;
  payload_id: string | null;
  sha256: string | null;
  ground_truth: unknown;
}

export async function loadExampleRows(pool: RagPool): Promise<ExampleRow[]> {
  const res = await pool.query<DbRow>(
    `SELECT id, payload->>'id' AS payload_id, payload->'image'->>'sha256' AS sha256, payload->'groundTruth' AS ground_truth FROM case_examples`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    payloadId: r.payload_id,
    sha256: r.sha256,
    groundTruthFingerprint: r.ground_truth == null ? null : fingerprint(r.ground_truth),
  }));
}

/** Asserts that no eval case was ingested into case_examples; never throws, the report carries the outcome. */
export async function checkLeakage(pool: RagPool, cases: EvalCase[]): Promise<LeakageResult> {
  const prints = cases.map(evalFingerprint);
  try {
    const rows = await loadExampleRows(pool);
    const leaks = findLeaks(rows, prints);
    const clean = leaks.idCollisions.length === 0 && leaks.sha256Collisions.length === 0 && leaks.groundTruthCollisions.length === 0;
    return {
      checked: true,
      exampleRows: rows.length,
      evalCases: prints.length,
      ...leaks,
      clean,
      note: clean
        ? `No eval case id, rendered-image sha256 or ground-truth fingerprint matches any of the ${rows.length} rows in case_examples.`
        : `Collisions with case_examples found; the colliding cases were shown to the model as retrieved examples and must be excluded.`,
    };
  } catch (err) {
    return {
      checked: false,
      exampleRows: 0,
      evalCases: prints.length,
      idCollisions: [],
      sha256Collisions: [],
      groundTruthCollisions: [],
      clean: null,
      note: `case_examples could not be queried (${err instanceof Error ? err.message : String(err)}); leakage NOT verified.`,
    };
  }
}
