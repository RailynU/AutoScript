import { execSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  REVIEW_COMPLETING_STATUSES,
  REVIEW_KIND_TRANSITIONS,
  ReviewStatus,
  type AnalyzeRequest,
  type AnalysisReport,
  type DashboardStats,
  type PrescriptionEvent,
  type PrescriptionStatus,
  type ReviewKind,
} from "@autoscript/shared";
import { createPrisma, type Db } from "../src/db.js";
import { loadEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";
import { demoReset } from "../src/services/demoReset.js";
import type { EngineClient } from "../src/services/engineClient.js";
import { sweepStaleProcessing, timeoutReason } from "../src/services/staleSweeper.js";
import { seedDatabase } from "../prisma/seed.js";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://autoscript:autoscript@localhost:5433/autoscript_test";

class FakeEngine implements EngineClient {
  requests: AnalyzeRequest[] = [];
  failNext = false;
  async submit(request: AnalyzeRequest): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("connection refused");
    }
    this.requests.push(request);
  }
  async health() {
    return true;
  }
}

let db: Db;
let app: Awaited<ReturnType<typeof buildServer>>;
let uploadDir: string;
const engine = new FakeEngine();

/** multipart/form-data body with a single PDF part named "file". */
function pdfUpload(content: string, boundary = "----rxgtest"): { payload: Buffer; headers: Record<string, string> } {
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rx.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const TEN_MINUTES_AGO = () => new Date(Date.now() - 10 * 60_000);

async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 5000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout waiting for condition");
}

function sampleReport(prescriptionId: string, disposition: AnalysisReport["disposition"]): AnalysisReport {
  return {
    prescriptionId,
    disposition,
    dispositionReason: "test",
    extraction: {
      patientName: "Margaret Holloway", patientDateOfBirth: null, prescriberName: "Dr. Test", prescriberIdentifier: null, dateWritten: "2026-10-23",
      medications: [{ rawName: "Ibuprofen 600 mg", normalizedName: "ibuprofen", normalizationSource: "LOCAL_MAP", strength: "600 mg", form: "tablet", route: "oral", sig: "1 q8h", frequency: "every 8 hours", quantity: "21", refills: "0", duration: null, indication: null, confidence: 0.95 }],
      statedAllergies: [], notes: null, uncertainties: [], overallConfidence: 0.95, extractor: "test",
    },
    findings: disposition === "MANUAL_REVIEW_NEEDED"
      ? [{ id: "f1", type: "DRUG_INTERACTION", severity: "HIGH", title: "Warfarin + NSAID", explanation: "x", aiContext: null, origin: "interaction.pairwise/warfarin-nsaid", medications: ["warfarin", "ibuprofen"], evidence: [], reviewQuestions: ["q"], deterministic: true }]
      : [],
    evidence: [],
    ai: null,
    coverage: { rulesEvaluated: ["interaction.pairwise"], referenceDocumentsSearched: 0, retrievalMethod: "NONE", llmUsed: false, limitations: [] },
    engineVersion: "test",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", { cwd: path.resolve(__dirname, ".."), env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
  db = createPrisma(TEST_DB);
  await seedDatabase(db);
  uploadDir = mkdtempSync(path.join(tmpdir(), "rxg-uploads-"));
  const env = loadEnv({ DATABASE_URL: TEST_DB, UPLOAD_DIR: uploadDir, API_URL: "http://localhost:4110" });
  app = await buildServer({ env, db, engine, logger: false });
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

describe("health + patients", () => {
  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, engine: true });
  });

  it("searches patients by name and by phone fragment", async () => {
    const byName = await app.inject({ method: "GET", url: "/api/patients?q=hollo" });
    expect(byName.json().patients.map((p: { lastName: string }) => p.lastName)).toEqual(["Holloway"]);
    const byPhone = await app.inject({ method: "GET", url: "/api/patients?q=1002" });
    expect(byPhone.json().patients.map((p: { lastName: string }) => p.lastName)).toEqual(["Reyes"]);
  });

  it("returns full patient context", async () => {
    const list = await app.inject({ method: "GET", url: "/api/patients?q=Reyes" });
    const id = list.json().patients[0].id;
    const res = await app.inject({ method: "GET", url: `/api/patients/${id}` });
    expect(res.json().patient.allergies[0].substance).toBe("Penicillin");
  });
});

describe("intake -> engine -> callback -> review", () => {
  let prescriptionId: string;

  it("creates a PROCESSING prescription from text and dispatches it with patient context", async () => {
    const patient = (await app.inject({ method: "GET", url: "/api/patients?q=Holloway" })).json().patients[0];
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/text", payload: { text: "Ibuprofen 600 mg, 1 tab q8h prn, #21", patientId: patient.id } });
    expect(res.statusCode).toBe(202);
    const rx = res.json().prescription;
    expect(rx.status).toBe("PROCESSING");
    expect(rx.patient.lastName).toBe("Holloway");
    prescriptionId = rx.id;

    const req = await waitFor(async () => engine.requests.find((r) => r.prescriptionId === prescriptionId));
    expect(req.source).toEqual({ kind: "text", text: "Ibuprofen 600 mg, 1 tab q8h prn, #21" });
    expect(req.patient?.medications.map((m) => m.genericName)).toContain("warfarin");
    expect(req.callbackUrl).toBe(`http://localhost:4110/api/internal/prescriptions/${prescriptionId}/engine-callback`);
  });

  it("rejects reviews while processing", async () => {
    const res = await app.inject({ method: "POST", url: `/api/prescriptions/${prescriptionId}/reviews`, payload: { action: "NOTE", notes: "x" } });
    expect(res.statusCode).toBe(409);
  });

  it("persists progress callbacks", async () => {
    const res = await app.inject({ method: "POST", url: `/api/internal/prescriptions/${prescriptionId}/engine-callback`, payload: { type: "progress", progress: { stage: "RUNNING_RULES", message: "Running 11 rules", percent: 55 } } });
    expect(res.statusCode).toBe(200);
    const detail = (await app.inject({ method: "GET", url: `/api/prescriptions/${prescriptionId}` })).json().prescription;
    expect(detail.progressStage).toBe("RUNNING_RULES");
    expect(detail.progressPercent).toBe(55);
  });

  it("rejects malformed callbacks", async () => {
    const res = await app.inject({ method: "POST", url: `/api/internal/prescriptions/${prescriptionId}/engine-callback`, payload: { type: "result", report: { nope: true } } });
    expect(res.statusCode).toBe(400);
  });

  it("stores the result and derives status, counts and severity", async () => {
    const res = await app.inject({ method: "POST", url: `/api/internal/prescriptions/${prescriptionId}/engine-callback`, payload: { type: "result", report: sampleReport(prescriptionId, "MANUAL_REVIEW_NEEDED") } });
    expect(res.statusCode).toBe(200);
    const detail = (await app.inject({ method: "GET", url: `/api/prescriptions/${prescriptionId}` })).json().prescription;
    expect(detail.status).toBe("MANUAL_REVIEW_NEEDED");
    expect(detail.findingCount).toBe(1);
    expect(detail.highestSeverity).toBe("HIGH");
    expect(detail.medicationSummary).toEqual(["ibuprofen"]);
    expect(detail.report.findings[0].type).toBe("DRUG_INTERACTION");
  });

  it("ignores late progress callbacks after completion", async () => {
    const res = await app.inject({ method: "POST", url: `/api/internal/prescriptions/${prescriptionId}/engine-callback`, payload: { type: "progress", progress: { stage: "EXTRACTING", message: "late", percent: 10 } } });
    expect(res.json()).toEqual({ ignored: true });
  });

  it("records notes and legacy MARK_REVIEWED: review status changes, screening status does not", async () => {
    const before = (await app.inject({ method: "GET", url: "/api/stats" })).json();
    const note = await app.inject({ method: "POST", url: `/api/prescriptions/${prescriptionId}/reviews`, payload: { action: "NOTE", pharmacistName: "Test PharmD", notes: "Called prescriber." } });
    expect(note.statusCode).toBe(200);
    expect(note.json().prescription.reviewStatus).toBe("PENDING_REVIEW");
    const done = await app.inject({ method: "POST", url: `/api/prescriptions/${prescriptionId}/reviews`, payload: { action: "MARK_REVIEWED", pharmacistName: "Test PharmD" } });
    const rx = done.json().prescription;
    expect(rx.status).toBe("MANUAL_REVIEW_NEEDED");
    expect(rx.reviewStatus).toBe("REVIEWED");
    expect(rx.reviewedAt).toBeTruthy();
    expect(rx.reviews.map((r: { action: string }) => r.action)).toEqual(["MARK_REVIEWED", "NOTE"]);
    const after = (await app.inject({ method: "GET", url: "/api/stats" })).json();
    expect(after.reviewedToday).toBe(before.reviewedToday + 1);
    expect(after.reviewed).toBe(before.reviewed + 1);
    expect(after.pendingReview).toBe(before.pendingReview - 1);
    expect(after.manualReviewNeeded).toBe(before.manualReviewNeeded);
  });

  it("lists newest first", async () => {
    const list = (await app.inject({ method: "GET", url: "/api/prescriptions" })).json().prescriptions;
    const times = list.map((p: { createdAt: string }) => new Date(p.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("uploads, scenarios, failures", () => {
  it("accepts a PDF upload and dispatches base64", async () => {
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/upload", ...pdfUpload("%PDF-1.4 fake") });
    expect(res.statusCode).toBe(202);
    const rx = res.json().prescription;
    expect(rx.sourceType).toBe("PDF");
    const req = await waitFor(async () => engine.requests.find((r) => r.prescriptionId === rx.id));
    expect(req.source.kind).toBe("file");
    if (req.source.kind === "file") expect(Buffer.from(req.source.base64, "base64").toString()).toBe("%PDF-1.4 fake");
    const file = await app.inject({ method: "GET", url: `/api/prescriptions/${rx.id}/file` });
    expect(file.headers["content-type"]).toBe("application/pdf");
  });

  it("rejects unsupported file types", async () => {
    const boundary = "----rxgtest2";
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--\r\n`;
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/upload", payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } });
    expect(res.statusCode).toBe(415);
  });

  it("simulates a scenario linked to the seeded patient", async () => {
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/simulate", payload: { scenarioKey: "amoxicillin-penicillin-allergy" } });
    expect(res.statusCode).toBe(202);
    expect(res.json().prescription.patient.lastName).toBe("Reyes");
    expect(res.json().prescription.sourceType).toBe("SIMULATED");
    const simulated = await waitFor(async () => engine.requests.find((r) => r.prescriptionId === res.json().prescription.id));
    expect(simulated.patient?.allergies[0]?.substance).toBe("Penicillin");
  });

  it("marks the prescription FAILED when the engine is unreachable, and retry re-dispatches", async () => {
    engine.failNext = true;
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/text", payload: { text: "Cetirizine 10 mg daily #30" } });
    const id = res.json().prescription.id;
    const failed = await waitFor(async () => {
      const d = (await app.inject({ method: "GET", url: `/api/prescriptions/${id}` })).json().prescription;
      return d.status === "FAILED" ? d : null;
    });
    expect(failed.failureReason).toContain("Could not reach RX Engine");
    const retry = await app.inject({ method: "POST", url: `/api/prescriptions/${id}/retry` });
    expect(retry.json().prescription.status).toBe("PROCESSING");
    await waitFor(async () => engine.requests.find((r) => r.prescriptionId === id));
  });
});

describe("review dispositions", () => {
  /** Create a prescription and drive it through the fake engine to a completed screening status. */
  async function completed(disposition: Exclude<PrescriptionStatus, "PROCESSING" | "FAILED" | "REVIEWED">): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/text", payload: { text: `Ibuprofen 600 mg #21 ${Math.random()}` } });
    const id: string = res.json().prescription.id;
    await waitFor(async () => engine.requests.find((r) => r.prescriptionId === id));
    const cb = await app.inject({ method: "POST", url: `/api/internal/prescriptions/${id}/engine-callback`, payload: { type: "result", report: sampleReport(id, disposition) } });
    expect(cb.statusCode).toBe(200);
    return id;
  }

  const post = (id: string, action: ReviewKind, notes?: string) =>
    app.inject({ method: "POST", url: `/api/prescriptions/${id}/reviews`, payload: { action, pharmacistName: "Test PharmD", ...(notes === undefined ? {} : { notes }) } });

  it("moves reviewStatus per the transition map for every kind and sets reviewedAt only on completing statuses", async () => {
    for (const [kind, next] of Object.entries(REVIEW_KIND_TRANSITIONS) as Array<[ReviewKind, ReviewStatus | null]>) {
      const id = await completed("MANUAL_REVIEW_NEEDED");
      const res = await post(id, kind, `note for ${kind}`);
      expect(res.statusCode, kind).toBe(200);
      const rx = res.json().prescription;
      expect(rx.status, kind).toBe("MANUAL_REVIEW_NEEDED");
      expect(rx.reviewStatus, kind).toBe(next ?? "PENDING_REVIEW");
      expect(Boolean(rx.reviewedAt), kind).toBe(next !== null && REVIEW_COMPLETING_STATUSES[next]);
    }
  });

  it("rejects OTHER and NOTE without a note with a clear 400, and unknown kinds", async () => {
    const id = await completed("NO_FLAGS_DETECTED");
    const other = await post(id, "OTHER");
    expect(other.statusCode).toBe(400);
    expect(other.json().error).toBe('A note is required for the "OTHER" action.');
    const blank = await post(id, "OTHER", "   ");
    expect(blank.statusCode).toBe(400);
    const note = await post(id, "NOTE");
    expect(note.statusCode).toBe(400);
    expect(note.json().error).toBe("A note is required to add a note.");
    const unknown = await post(id, "APPROVE" as ReviewKind, "x");
    expect(unknown.statusCode).toBe(400);
    const detail = (await app.inject({ method: "GET", url: `/api/prescriptions/${id}` })).json().prescription;
    expect(detail.reviews).toEqual([]);
    expect(detail.reviewStatus).toBe("PENDING_REVIEW");
  });

  it("keeps legacy MARK_REVIEWED working without writing status=REVIEWED", async () => {
    const id = await completed("NO_FLAGS_DETECTED");
    const res = await post(id, "MARK_REVIEWED");
    expect(res.statusCode).toBe(200);
    expect(res.json().prescription.status).toBe("NO_FLAGS_DETECTED");
    expect(res.json().prescription.reviewStatus).toBe("REVIEWED");
    expect(res.json().prescription.reviewedAt).toBeTruthy();
    const row = await db.prescription.findUniqueOrThrow({ where: { id }, select: { status: true } });
    expect(row.status).toBe("NO_FLAGS_DETECTED");
  });

  it("returns history newest first and the latest action wins the status", async () => {
    const id = await completed("MANUAL_REVIEW_NEEDED");
    expect((await post(id, "NOTE", "first")).statusCode).toBe(200);
    expect((await post(id, "INFO_REQUESTED", "asked for indication")).statusCode).toBe(200);
    expect((await post(id, "INTERVENTION_DOCUMENTED", "dose reduced with prescriber")).statusCode).toBe(200);
    const rx = (await app.inject({ method: "GET", url: `/api/prescriptions/${id}` })).json().prescription;
    expect(rx.reviewStatus).toBe("INTERVENTION_DOCUMENTED");
    expect(rx.reviews.map((r: { action: string }) => r.action)).toEqual(["INTERVENTION_DOCUMENTED", "INFO_REQUESTED", "NOTE"]);
    expect(rx.reviews.map((r: { notes: string | null }) => r.notes)).toEqual(["dose reduced with prescriber", "asked for indication", "first"]);
    const times = rx.reviews.map((r: { createdAt: string }) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("stats equal direct row counts after a sequence of actions", async () => {
    const a = await completed("MANUAL_REVIEW_NEEDED");
    const b = await completed("NO_FLAGS_DETECTED");
    const c = await completed("MANUAL_REVIEW_NEEDED");
    expect((await post(a, "INTERVENTION_REQUIRED")).statusCode).toBe(200);
    expect((await post(b, "PRESCRIBER_CONTACTED")).statusCode).toBe(200);
    expect((await post(c, "REVIEWED_NO_INTERVENTION")).statusCode).toBe(200);
    expect((await post(c, "OTHER", "re-opened after a call")).statusCode).toBe(200);
    const stats: DashboardStats = (await app.inject({ method: "GET", url: "/api/stats" })).json();
    const count = (where: Prisma.PrescriptionWhereInput) => db.prescription.count({ where });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    expect(stats.pendingReview).toBe(await count({ reviewStatus: "PENDING_REVIEW" }));
    expect(stats.interventionRequired).toBe(await count({ reviewStatus: "INTERVENTION_REQUIRED" }));
    expect(stats.infoRequested).toBe(await count({ reviewStatus: "INFO_REQUESTED" }));
    expect(stats.interventionDocumented).toBe(await count({ reviewStatus: "INTERVENTION_DOCUMENTED" }));
    expect(stats.reviewed).toBe(await count({ reviewStatus: "REVIEWED" }));
    expect(stats.manualReviewNeeded).toBe(await count({ status: "MANUAL_REVIEW_NEEDED" }));
    expect(stats.noFlagsDetected).toBe(await count({ status: "NO_FLAGS_DETECTED" }));
    expect(stats.processing).toBe(await count({ status: "PROCESSING" }));
    expect(stats.failed).toBe(await count({ status: "FAILED" }));
    expect(stats.reviewedToday).toBe(await count({ reviewedAt: { gte: startOfDay } }));
    expect(stats.total).toBe(await count({}));
    expect(stats.pendingReview + stats.interventionRequired + stats.infoRequested + stats.interventionDocumented + stats.reviewed).toBe(stats.total);
    expect(stats.interventionRequired).toBeGreaterThanOrEqual(1);
    expect(stats.infoRequested).toBeGreaterThanOrEqual(1);
  });

  it("filters the list by reviewStatus and rejects unknown values", async () => {
    const id = await completed("MANUAL_REVIEW_NEEDED");
    expect((await post(id, "INFO_REQUESTED")).statusCode).toBe(200);
    for (const reviewStatus of ReviewStatus.options) {
      const list = (await app.inject({ method: "GET", url: `/api/prescriptions?reviewStatus=${reviewStatus}` })).json().prescriptions;
      expect(list.every((p: { reviewStatus: string }) => p.reviewStatus === reviewStatus), reviewStatus).toBe(true);
      expect(list.length).toBe(await db.prescription.count({ where: { reviewStatus } }));
      if (reviewStatus === "INFO_REQUESTED") expect(list.map((p: { id: string }) => p.id)).toContain(id);
    }
    const both = (await app.inject({ method: "GET", url: "/api/prescriptions?status=MANUAL_REVIEW_NEEDED&reviewStatus=INFO_REQUESTED" })).json().prescriptions;
    expect(both.every((p: { status: string; reviewStatus: string }) => p.status === "MANUAL_REVIEW_NEEDED" && p.reviewStatus === "INFO_REQUESTED")).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/prescriptions?reviewStatus=APPROVED" })).statusCode).toBe(400);
  });
});

describe("stale PROCESSING sweeper", () => {
  async function processing(text: string): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/api/prescriptions/text", payload: { text } });
    const id: string = res.json().prescription.id;
    await waitFor(async () => engine.requests.find((r) => r.prescriptionId === id));
    return id;
  }
  const row = (id: string) => db.prescription.findUniqueOrThrow({ where: { id }, select: { status: true, progressStage: true, failureReason: true } });

  it("marks only the stale row FAILED with the timeout reason, publishes the SSE event, and retry re-dispatches", async () => {
    const stale = await processing(`Stale ${Math.random()}`);
    const fresh = await processing(`Fresh ${Math.random()}`);
    await db.prescription.update({ where: { id: stale }, data: { updatedAt: TEN_MINUTES_AGO() } });

    const events: PrescriptionEvent[] = [];
    const unsubscribe = app.ctx.bus.subscribe((e) => events.push(e));
    const marked = await sweepStaleProcessing({ db, bus: app.ctx.bus, log: app.ctx.log }, 180_000);
    unsubscribe();

    expect(marked).toEqual([stale]);
    expect(await row(stale)).toEqual({ status: "FAILED", progressStage: "FAILED", failureReason: "Analysis timed out after 180 s; retry from the detail page" });
    expect(timeoutReason(180_000)).toBe("Analysis timed out after 180 s; retry from the detail page");
    expect(await row(fresh)).toMatchObject({ status: "PROCESSING", failureReason: null });
    expect(events).toEqual([expect.objectContaining({ type: "failed", prescription: expect.objectContaining({ id: stale, status: "FAILED" }) })]);
    expect(await sweepStaleProcessing({ db, bus: app.ctx.bus, log: app.ctx.log }, 180_000)).toEqual([]);

    const before = engine.requests.length;
    const retry = await app.inject({ method: "POST", url: `/api/prescriptions/${stale}/retry` });
    expect(retry.statusCode).toBe(202);
    expect(retry.json().prescription).toMatchObject({ status: "PROCESSING", failureReason: null });
    await waitFor(async () => engine.requests.slice(before).find((r) => r.prescriptionId === stale));
  });

  it("runs at startup: a server built with a 1 s timeout sweeps an already-stale row", async () => {
    const stale = await processing(`Startup ${Math.random()}`);
    await db.prescription.update({ where: { id: stale }, data: { updatedAt: TEN_MINUTES_AGO() } });
    const env = loadEnv({ DATABASE_URL: TEST_DB, UPLOAD_DIR: uploadDir, API_URL: "http://localhost:4110", PROCESSING_TIMEOUT_MS: "1000", STALE_SWEEP_INTERVAL_MS: "60000" });
    const second = await buildServer({ env, db, engine, logger: false });
    try {
      const swept = await waitFor(async () => {
        const r = await row(stale);
        return r.status === "FAILED" ? r : null;
      });
      expect(swept.failureReason).toBe("Analysis timed out after 1 s; retry from the detail page");
    } finally {
      await second.close();
    }
  });
});

describe("error handling", () => {
  it("answers an unexpected throw with a generic {error}, keeps 4xx messages, and reports validation issues", async () => {
    const env = loadEnv({ DATABASE_URL: TEST_DB, UPLOAD_DIR: uploadDir, API_URL: "http://localhost:4110" });
    const second = await buildServer({ env, db, engine, logger: false, sweeper: false });
    second.get("/boom", async () => {
      throw new Error("secret internal detail from /Users/someone/file.ts:12");
    });
    second.get("/teapot", async () => {
      throw Object.assign(new Error("I am a teapot"), { statusCode: 418 });
    });
    try {
      const boom = await second.inject({ method: "GET", url: "/api/boom" });
      expect(boom.statusCode).toBe(500);
      expect(boom.json()).toEqual({ error: "Internal server error" });
      expect(boom.body).not.toMatch(/secret|file\.ts|stack|    at /);
      const teapot = await second.inject({ method: "GET", url: "/api/teapot" });
      expect(teapot.statusCode).toBe(418);
      expect(teapot.json()).toEqual({ error: "I am a teapot" });
      const invalid = await second.inject({ method: "GET", url: "/api/prescriptions?limit=abc" });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error).toBe("Validation failed");
      expect(invalid.json().issues[0].path).toBe("limit");
    } finally {
      await second.close();
    }
  });
});

describe("demo reset (runs last: it empties the queue)", () => {
  it("deletes prescriptions, reviews and uploads, keeps patients, recreates a missing seed patient, refuses in production, reseeds history on request", async () => {
    const upload = (await app.inject({ method: "POST", url: "/api/prescriptions/upload", ...pdfUpload("%PDF-1.4 reset") })).json().prescription;
    const filePath = (await db.prescription.findUniqueOrThrow({ where: { id: upload.id }, select: { filePath: true } })).filePath!;
    expect(existsSync(filePath)).toBe(true);
    await db.patient.delete({ where: { externalId: "PT-1008" } });
    const before = { prescriptions: await db.prescription.count(), reviews: await db.review.count(), patients: await db.patient.count() };
    expect(before.prescriptions).toBeGreaterThan(0);
    expect(before.reviews).toBeGreaterThan(0);
    expect(before.patients).toBe(7);

    await expect(demoReset(db, { nodeEnv: "production" })).rejects.toThrow(/refuses to run/);
    expect(await db.prescription.count()).toBe(before.prescriptions);
    expect(existsSync(filePath)).toBe(true);

    const summary = await demoReset(db, { nodeEnv: "test" });
    expect(summary).toEqual({ prescriptionsDeleted: before.prescriptions, reviewsDeleted: before.reviews, filesDeleted: expect.any(Number), patientsCreated: ["PT-1008"], historicalSeeded: 0 });
    expect(summary.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(existsSync(filePath)).toBe(false);
    expect(await db.prescription.count()).toBe(0);
    expect(await db.review.count()).toBe(0);
    expect(await db.patient.count()).toBe(8);

    const withHistory = await demoReset(db, { nodeEnv: "test", withHistory: true });
    expect(withHistory).toMatchObject({ prescriptionsDeleted: 0, reviewsDeleted: 0, patientsCreated: [], historicalSeeded: 5 });
    const refs = (await db.prescription.findMany({ select: { externalRef: true }, orderBy: { externalRef: "asc" } })).map((p) => p.externalRef);
    expect(refs).toEqual(["RX-SEED-0001", "RX-SEED-0002", "RX-SEED-0003", "RX-SEED-0004", "RX-SEED-0005"]);
    expect(await db.patient.count()).toBe(8);
  });
});
