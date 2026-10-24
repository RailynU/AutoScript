import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyzeRequest, EngineCallback, PatientContext } from "@autoscript/shared";
import { buildAnalysisMessages, EXAMPLES_HEADING } from "../analysis/aiAnalysis.js";
import type { DatasetEntry } from "../dataset/schema.js";
import type { UsDatasetEntry } from "../dataset/us/schema.js";
import { createRagPool, type RagPool } from "../rag/db.js";
import { isUsableRxEntry, rxEntryToExample, scrubIdentifiers, usEntryToExample } from "../rag/exampleCases.js";
import { countExamples, searchExamples } from "../rag/examples.js";
import { ingestExamples } from "../rag/ingestExamples.js";
import { Retriever } from "../rag/retrieve.js";
import { buildExampleQuery, runPipeline } from "../pipeline.js";
import { FakeLlm } from "./fakeLlm.js";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://autoscript:autoscript@localhost:5433/autoscript_test";
let pool: RagPool;
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

const usPatient: PatientContext = {
  id: "US-9001", firstName: "Jordan", lastName: "Kowalski", dateOfBirth: "2002-08-12", sex: "F", phone: "555-0146", weightKg: 81,
  allergiesVerified: true, allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2026-10-17" }],
  conditions: [{ name: "Atrial fibrillation", icd10: "I48.91", status: "ACTIVE" }],
  medications: [{ name: "Coumadin", genericName: "warfarin", dose: "5 mg", frequency: "once daily", startedAt: "2023-12-04", active: true }],
};

const usFixture: UsDatasetEntry = {
  id: "us-fixture-001",
  scenario: "INTERACTION",
  style: "printed",
  difficulty: "clean",
  image: { path: "images/us-fixture-001.png", sha256: "0".repeat(64), bytes: 1, width: 10, height: 10, mimeType: "image/png" },
  groundTruth: {
    patient: usPatient,
    patientAddress: "2844 Willow Court, Boise, ID 83702",
    prescriber: { name: "Dr. Kevin Adeyemi, PA-C", clinic: "Maple Grove Community Health", street: "960 Orchard Lane", cityState: "Lincoln, NE 68508", phone: "555-0251", npi: "1934636741", dea: null },
    dateWritten: "2025-10-01",
    dateAsWritten: "10/01/2025",
    allergiesOnScript: "NKDA",
    medications: [{ writtenName: "Ibuprofen", generic: "ibuprofen", strength: "600 mg", form: "tablet", route: "by mouth", sig: "Take 1 tablet by mouth every 8 hours as needed for pain", quantity: "21", refills: "0", indication: "pain" }],
    notes: null,
  },
  injectedErrors: [{ code: "INTERACTION_WITH_PROFILE", detail: "warfarin + ibuprofen" }],
  label: {
    verdict: "bad",
    ruleFindings: [{ id: "f1", type: "DRUG_INTERACTION", severity: "HIGH", title: "Warfarin + NSAID: bleeding risk", explanation: "x", origin: "interaction.pairwise/warfarin-nsaid-ibuprofen", medications: ["warfarin", "ibuprofen"], referenceIds: [] }],
    consistency: "consistent",
    rulesVersion: "test",
    labelSource: "ground-truth+deterministic-rules",
  },
  extraction: null,
  extractionScore: null,
  provenance: { seed: 1, generatorVersion: "test", model: null, extractedAt: null, error: null },
};

const rxFixture: DatasetEntry = {
  id: "rx-fixture-001",
  image: { path: "images/rx-fixture-001.jpg", originalFileName: "x.jpg", sha256: "1".repeat(64), bytes: 1, width: 10, height: 10, mimeType: "image/jpeg" },
  duplicateOf: null,
  document: { type: "prescription", handwritten: "handwritten", language: "en", legibility: 0.8, qualityNotes: [] },
  extraction: {
    patientName: "Ms. PRATHNA", patientDateOfBirth: null, prescriberName: "Dr. R.Keshwani", prescriberIdentifier: null, dateWritten: "15-03-87",
    medications: [{ rawName: "ZOFER", normalizedName: null, normalizationSource: "UNRESOLVED", strength: null, form: "Tab", route: null, sig: null, frequency: null, quantity: null, refills: null, duration: null, indication: null, confidence: 0.7 }],
    statedAllergies: [], notes: "Prathna reports acute GE and dehydration; follow up with Keshwani on 20-03-87", uncertainties: [], overallConfidence: 0.75, extractor: "fake",
  },
  label: {
    verdict: "bad",
    issues: [
      { code: "MEDICATION_MISSING_STRENGTH", severity: "blocking", detail: '"ZOFER" has no strength.' },
      { code: "UNRECOGNIZED_DRUG", severity: "warning", detail: '"ZOFER" is not in the local drug map (brand or regional name?).' },
    ],
    clinicalFindings: [], rulesVersion: "test", labelSource: "deterministic-rubric", humanReviewed: false,
  },
  piiRedacted: false,
  provenance: { model: "fake", extractedAt: "2026-10-24T00:00:00Z", durationMs: 1, error: null },
};

const ibuprofenExtraction = {
  patientName: "Jordan Kowalski", prescriberName: "Dr. Marchetti", dateWritten: "2026-10-23",
  medications: [{ rawName: "Ibuprofen", genericNameGuess: "ibuprofen", strength: "600 mg", form: "tablet", sig: "1 tablet every 8 hours as needed", frequency: "every 8 hours", quantity: "21", confidence: 0.95 }],
  overallConfidence: 0.95,
};

function analysisCiting(ids: string[]) {
  return { summary: "s", reasoning: "r", findings: [], additionalObservations: [{ title: "Bleeding risk", severity: "MODERATE", explanation: "see examples", citations: ids, reviewQuestions: [], medications: ["ibuprofen"] }], reviewQuestions: [] };
}

async function runWarfarinIbuprofen(llm: FakeLlm) {
  const req: AnalyzeRequest = { prescriptionId: "rx-examples-test", callbackUrl: "http://localhost:0/cb", source: { kind: "text", text: "Ibuprofen 600 mg q8h #21" }, patient: usPatient };
  const callbacks: EngineCallback[] = [];
  const report = await runPipeline({ llm, retriever: new Retriever(pool, llm), send: async (cb) => void callbacks.push(cb), log: silentLog }, req);
  const userPrompt = String(llm.calls[1]?.[1]?.content ?? "");
  return { report, userPrompt };
}

beforeAll(async () => {
  pool = createRagPool(TEST_DB);
  await ingestExamples(pool, new FakeLlm([]), { inputs: [] });
  await pool.query(`DELETE FROM case_examples`);
});
afterAll(async () => {
  await pool.query(`DELETE FROM case_examples WHERE id = ANY($1::text[])`, [[usFixture.id, rxFixture.id]]);
  await pool.end();
});

describe("example summaries", () => {
  it("never contain the patient or prescriber name, addresses, phones or dates of the source entry", () => {
    const us = usEntryToExample(usFixture);
    for (const leaked of ["Jordan", "Kowalski", "Adeyemi", "Maple Grove", "Willow Court", "555-0146", "555-0251", "1934636741", "2002-08-12", "2025-10-01", "10/01/2025"]) {
      expect(us.summary, `us summary leaks ${leaked}`).not.toContain(leaked);
    }
    expect(us.summary).toContain("Ibuprofen");
    expect(us.summary).toContain("warfarin 5 mg once daily");
    expect(us.summary).toContain("Verdict: BAD because: INTERACTION_WITH_PROFILE: warfarin + ibuprofen");
    expect(us.reasons).toEqual(["INTERACTION_WITH_PROFILE", "Warfarin + NSAID: bleeding risk"]);
    expect(us.payload).toMatchObject({ id: "us-fixture-001", scenario: "INTERACTION" });

    const rx = rxEntryToExample(rxFixture);
    for (const leaked of ["PRATHNA", "Prathna", "Keshwani", "15-03-87", "20-03-87"]) {
      expect(rx.summary, `rx summary leaks ${leaked}`).not.toContain(leaked);
    }
    expect(rx.summary).toContain("ZOFER (not recognized); strength MISSING");
    expect(rx.summary).toContain("acute GE and dehydration");
    expect(rx.summary).toContain("Verdict: BAD because: MEDICATION_MISSING_STRENGTH (blocking)");
    expect(rx.reasons).toEqual(["MEDICATION_MISSING_STRENGTH", "UNRECOGNIZED_DRUG"]);
    expect(rx.scenario).toBeNull();
  });

  it("scrubIdentifiers keeps clinical tokens shorter than a name token and keeps line breaks", () => {
    expect(scrubIdentifiers("Dr. Li saw Ibuprofen 600 mg\nqty 21", ["Dr. Li", "Maple Grove"])).toBe("Dr. Li saw Ibuprofen 600 mg\nqty 21");
  });

  it("only prescription photos with an extraction and no duplicate are usable", () => {
    expect(isUsableRxEntry(rxFixture)).toBe(true);
    expect(isUsableRxEntry({ ...rxFixture, duplicateOf: "rx-001" })).toBe(false);
    expect(isUsableRxEntry({ ...rxFixture, extraction: null })).toBe(false);
    expect(isUsableRxEntry({ ...rxFixture, document: { ...rxFixture.document!, type: "lab_request" } })).toBe(false);
  });
});

describe("example ingestion and retrieval", () => {
  it("upserts idempotently and finds the warfarin example lexically", async () => {
    const inputs = [usEntryToExample(usFixture), rxEntryToExample(rxFixture)];
    const first = await ingestExamples(pool, new FakeLlm([]), { inputs, skipped: 4 });
    expect(first).toEqual({ ingested: 2, embedded: 0, skipped: 4 });
    const second = await ingestExamples(pool, new FakeLlm([]), { inputs });
    expect(second.ingested).toBe(2);
    expect(await countExamples(pool)).toBe(2);

    const hits = await searchExamples(pool, new FakeLlm([]), "ibuprofen 600 mg every 8 hours; allergy NKDA; Atrial fibrillation; warfarin", 3);
    expect(hits[0]).toMatchObject({ id: "us-fixture-001", dataset: "us-synthetic", scenario: "INTERACTION", verdict: "bad", retrieval: "LEXICAL" });
    expect(hits[0]!.score).toBeGreaterThan(0);
    expect(hits[0]!.reasons).toContain("INTERACTION_WITH_PROFILE");
  });

  it("buildExampleQuery uses medication lines and patient context, never names", () => {
    const q = buildExampleQuery({ ...ibuprofenExtraction, medications: [{ ...ibuprofenExtraction.medications[0]!, normalizedName: "ibuprofen", normalizationSource: "LOCAL_MAP", route: null, refills: null, duration: null, indication: null }], statedAllergies: [], notes: null, uncertainties: [], extractor: "fake", patientDateOfBirth: null, prescriberIdentifier: null }, usPatient);
    expect(q).toBe("ibuprofen 600 mg 1 tablet every 8 hours as needed qty 21; allergy NKDA; Atrial fibrillation; warfarin");
  });
});

describe("AI analysis with example cases", () => {
  it("shows the examples block, records similarCases, and rejects an example id used as a citation", async () => {
    const llm = new FakeLlm([ibuprofenExtraction, analysisCiting(["us-fixture-001", "rx-fixture-001"])]);
    const { report, userPrompt } = await runWarfarinIbuprofen(llm);
    expect(report).not.toBeNull();
    expect(userPrompt).toContain(EXAMPLES_HEADING);
    expect(userPrompt).toContain("Example us-fixture-001 (dataset us-synthetic, scenario INTERACTION) labelled BAD");
    expect(userPrompt.indexOf(EXAMPLES_HEADING)).toBeGreaterThan(userPrompt.indexOf("## EVIDENCE"));
    expect(report!.ai!.similarCases.map((c) => c.id)).toContain("us-fixture-001");
    expect(report!.ai!.similarCases[0]).toMatchObject({ dataset: "us-synthetic", verdict: "bad", retrieval: "LEXICAL" });
    expect(report!.ai!.similarCases.every((c) => !("summary" in c))).toBe(true);
    expect(report!.ai!.rejectedCitations).toEqual(["us-fixture-001", "rx-fixture-001"]);
    const observation = report!.findings.find((f) => f.type === "AI_OBSERVATION")!;
    expect(observation.evidence).toEqual([]);
    expect(report!.evidence.every((e) => e.chunkId !== "us-fixture-001")).toBe(true);
  });

  it("omits the block and reports an empty similarCases when no example exists", async () => {
    await pool.query(`DELETE FROM case_examples`);
    const llm = new FakeLlm([ibuprofenExtraction, analysisCiting([])]);
    const { report, userPrompt } = await runWarfarinIbuprofen(llm);
    expect(userPrompt).not.toContain(EXAMPLES_HEADING);
    expect(userPrompt).not.toContain("Example ");
    expect(report!.ai!.similarCases).toEqual([]);
    expect(report!.ai!.rejectedCitations).toEqual([]);
  });

  it("buildAnalysisMessages adds no block for an empty similarCases array", () => {
    const base = { extraction: { ...ibuprofenExtraction, medications: [], statedAllergies: [], notes: null, uncertainties: [], extractor: "fake", patientDateOfBirth: null, prescriberIdentifier: null }, patient: null, findings: [], evidencePool: [] };
    const without = String(buildAnalysisMessages(base)[1]!.content);
    const withEmpty = String(buildAnalysisMessages({ ...base, similarCases: [] })[1]!.content);
    expect(withEmpty).toBe(without);
    expect(without).not.toContain(EXAMPLES_HEADING);
  });
});
