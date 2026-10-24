import { createHash } from "node:crypto";
import { renderPrescription } from "../dataset/us/render.js";
import { createRng } from "../dataset/us/rng.js";
import type { EvalCase, EvalCaseSpec } from "./types.js";

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

/** Turns a case spec into a pipeline request source; rendering happens here, deterministically from the spec's seed. */
export async function materializeCase(spec: EvalCaseSpec): Promise<{ evalCase: EvalCase; png: Buffer | null }> {
  const { source, ...rest } = spec;
  if (source.kind === "render") {
    const png = await renderPrescription(source.groundTruth, source.style, source.difficulty, createRng(source.seed));
    return {
      png,
      evalCase: {
        ...rest,
        source: { kind: "file", fileName: `${spec.id}.png`, mimeType: "image/png", base64: png.toString("base64") },
        style: source.style,
        difficulty: source.difficulty,
        image: { sha256: sha256(png), bytes: png.length },
      },
    };
  }
  if (source.kind === "file") {
    const buf = Buffer.from(source.base64, "base64");
    return { png: null, evalCase: { ...rest, source, style: null, difficulty: null, image: { sha256: sha256(buf), bytes: buf.length } } };
  }
  return { png: null, evalCase: { ...rest, source, style: null, difficulty: null, image: null } };
}
