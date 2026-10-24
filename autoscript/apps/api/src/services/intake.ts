import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { EnteredScriptDataSchema, type AnalyzeRequest, type EnteredScriptData, type PrescriptionEvent, type SourceType } from "@autoscript/shared";
import type { Db } from "../db.js";
import type { PrescriptionEventBus } from "../events.js";
import { toListItem, toPatientContext } from "../serializers.js";
import type { EngineClient } from "./engineClient.js";

export interface IntakeDeps {
  db: Db;
  bus: PrescriptionEventBus;
  engine: EngineClient;
  uploadDir: string;
  apiUrl: string;
  log: FastifyBaseLogger;
}

export interface TextIntake {
  kind: "text";
  text: string;
  patientId: string | null;
  sourceType?: SourceType;
}

export interface FileIntake {
  kind: "file";
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  patientId: string | null;
  /** Technician manual entry, verified against the script by the engine. */
  enteredData?: EnteredScriptData | null;
}

export type IntakeInput = TextIntake | FileIntake;

const ALLOWED_MIME = new Map<string, SourceType>([
  ["application/pdf", "PDF"],
  ["image/jpeg", "IMAGE"],
  ["image/png", "IMAGE"],
]);

export function sourceTypeForMime(mime: string): SourceType | null {
  return ALLOWED_MIME.get(mime.toLowerCase()) ?? null;
}

function nextExternalRef(): string {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `RX-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

/** Create the prescription row (PROCESSING) and dispatch it to the engine. */
export async function createPrescription(deps: IntakeDeps, input: IntakeInput) {
  const { db } = deps;
  if (input.patientId) {
    const exists = await db.patient.findUnique({ where: { id: input.patientId }, select: { id: true } });
    if (!exists) throw Object.assign(new Error("Patient not found"), { statusCode: 404 });
  }

  let filePath: string | null = null;
  let sourceType: SourceType;
  if (input.kind === "file") {
    const st = sourceTypeForMime(input.mimeType);
    if (!st) throw Object.assign(new Error(`Unsupported file type ${input.mimeType}`), { statusCode: 415 });
    sourceType = st;
    await mkdir(deps.uploadDir, { recursive: true });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    filePath = path.join(deps.uploadDir, `${randomUUID()}-${safeName}`);
    await writeFile(filePath, input.buffer);
  } else {
    sourceType = input.sourceType ?? "TEXT";
  }

  const rx = await db.prescription.create({
    data: {
      externalRef: nextExternalRef(),
      status: "PROCESSING",
      sourceType,
      fileName: input.kind === "file" ? input.fileName : null,
      filePath,
      mimeType: input.kind === "file" ? input.mimeType : null,
      rawText: input.kind === "text" ? input.text : null,
      patientId: input.patientId,
      enteredData: input.kind === "file" && input.enteredData ? input.enteredData : undefined,
      progressStage: "QUEUED",
      progressMessage: "Queued for RX Engine",
      progressPercent: 2,
    },
    include: { patient: true },
  });
  deps.bus.publish({ type: "created", prescription: toListItem(rx) });

  // Fire and forget: the HTTP response returns immediately with PROCESSING.
  void dispatchToEngine(deps, rx.id).catch((err) => deps.log.error({ err, prescriptionId: rx.id }, "dispatch failed"));
  return rx;
}

/** Build the engine payload from persisted state and submit it. Used for first run and retries. */
export async function dispatchToEngine(deps: IntakeDeps, prescriptionId: string): Promise<void> {
  const { db } = deps;
  const rx = await db.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: { include: { allergies: true, conditions: true, medications: true } } },
  });
  if (!rx) throw new Error(`Prescription ${prescriptionId} not found`);

  let source: AnalyzeRequest["source"];
  if (rx.filePath && rx.mimeType && rx.fileName) {
    const buffer = await readFile(rx.filePath);
    source = { kind: "file", fileName: rx.fileName, mimeType: rx.mimeType, base64: buffer.toString("base64") };
  } else if (rx.rawText) {
    source = { kind: "text", text: rx.rawText };
  } else {
    await failPrescription(deps, rx.id, "Prescription has neither a file nor text to analyze.");
    return;
  }

  const request: AnalyzeRequest = {
    prescriptionId: rx.id,
    callbackUrl: `${deps.apiUrl}/api/internal/prescriptions/${rx.id}/engine-callback`,
    source,
    patient: rx.patient ? toPatientContext(rx.patient) : null,
    enteredData: parseEnteredData(rx.enteredData),
  };

  try {
    await deps.engine.submit(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failPrescription(deps, rx.id, `Could not reach RX Engine: ${message}`);
  }
}

export function parseEnteredData(raw: unknown): EnteredScriptData | null {
  if (!raw) return null;
  const parsed = EnteredScriptDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function failPrescription(deps: IntakeDeps, id: string, reason: string): Promise<void> {
  const rx = await deps.db.prescription.update({
    where: { id },
    data: { status: "FAILED", progressStage: "FAILED", progressMessage: reason, failureReason: reason },
    include: { patient: true },
  });
  const event: PrescriptionEvent = { type: "failed", prescription: toListItem(rx) };
  deps.bus.publish(event);
}
