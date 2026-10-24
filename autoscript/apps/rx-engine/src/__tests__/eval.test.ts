import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalysisReport, Finding } from "@autoscript/shared";
import { labelCase } from "../dataset/us/label.js";
import { CURATED_CASES, REQUIRED_SCENARIOS } from "../eval/cases.js";
import { ALL_RULE_FAMILIES, originMatches, SCENARIO_FAMILIES } from "../eval/families.js";
import { generatedCaseSpecs, INGESTED_EXAMPLES_SEED } from "../eval/generated.js";
import { canonicalJson, evalFingerprint, findLeaks, fingerprint } from "../eval/leakage.js";
import { materializeCase } from "../eval/materialize.js";
import { aggregate, forbiddenWording, matchFamilies, ratio } from "../eval/metrics.js";
import { renderMarkdown } from "../eval/report.js";
import { evaluateCase, runCases, scoreCase } from "../eval/runner.js";
import type { CaseResult, EvalCase, EvalReport } from "../eval/types.js";
import { ACCESSED_ON, CASE_VALIDATION, CURATED_CASE_IDS, MAX_QUOTE_WORDS, RULE_LEVEL_VALIDATION, VALIDATION_STATUSES, validationFor } from "../eval/validation.js";
import { createRagPool, type RagPool } from "../rag/db.js";
import { ingestReferences } from "../rag/ingest.js";
import { FakeLlm } from "./fakeLlm.js";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://autoscript:autoscript@localhost:5433/autoscript_test";
let pool: RagPool;

beforeAll(async () => {
  pool = createRagPool(TEST_DB);
  await ingestReferences(pool, new FakeLlm([]));
});
afterAll(async () => pool.end());

const finding = (over: Partial<Finding> & Pick<Finding, "id" | "origin" | "deterministic">): Finding => ({
  type: "DRUG_INTERACTION", severity: "HIGH", title: "t", explanation: "e", aiContext: null, medications: [], evidence: [], reviewQuestions: [],
  therapyContext: "UNKNOWN", therapyContextBasis: null, severitySource: "RULE_TABLE", supportStatus: null, proposedSeverity: null, ...over,
});

describe("matchFamilies", () => {
  it("counts a family once, matches origin prefixes, and leaves unlabelled families out of the counts", () => {
    const d = matchFamilies(["interaction.pairwise/warfarin-nsaid", "interaction.pairwise/ace-inhibitor-nsaid", "rx.extraction-confidence"], ["interaction.pairwise/warfarin-nsaid"], ["allergy.cross-reactivity", "rx.unresolved-drug"]);
    expect(d).toMatchObject({ tp: 1, fp: 0, fn: 0, tn: 2, matched: ["interaction.pairwise/warfarin-nsaid"], missed: [], falseAlarms: [] });
    // ace-inhibitor-nsaid shares the rule id but is neither expected nor banned; extraction-confidence likewise.
    expect(d.unlabeled).toEqual(["interaction.pairwise", "rx.extraction-confidence"]);
  });

  it("records misses and false alarms", () => {
    const d = matchFamilies(["allergy.cross-reactivity"], ["interaction.pairwise"], ["allergy.cross-reactivity"]);
    expect(d).toMatchObject({ tp: 0, fp: 1, fn: 1, tn: 0, missed: ["interaction.pairwise"], falseAlarms: ["allergy.cross-reactivity"], unlabeled: [] });
  });

  it("a family-level expectation is met by any entry of that rule", () => {
    expect(originMatches("interaction.pairwise/warfarin-nsaid", "interaction.pairwise")).toBe(true);
    expect(originMatches("interaction.pairwise", "interaction.pairwise/warfarin-nsaid")).toBe(false);
    expect(matchFamilies(["interaction.pairwise/ssri-nsaid"], ["interaction.pairwise"], []).tp).toBe(1);
  });
});

describe("ratios and aggregate", () => {
  it("a zero denominator is null, never 0 or NaN", () => {
    expect(ratio(0, 0).value).toBeNull();
    expect(ratio(2, 4).value).toBe(0.5);
  });

  it("aggregate over no cases reports n/a everywhere a label would be needed", () => {
    const a = aggregate([]);
    expect(a.detection.precision.value).toBeNull();
    expect(a.detection.recall.value).toBeNull();
    expect(a.disposition.value).toBeNull();
    expect(a.evidence.value).toBeNull();
    expect(a.extraction.meanOverall).toBeNull();
    expect(a.meanDurationMs).toBeNull();
  });

  it("aggregate sums the per-case confusion counts and skips errored cases", () => {
    const c = CURATED_CASES[0]!;
    const base: EvalCase = { ...c, source: { kind: "text", text: "x" }, style: null, difficulty: null, image: null };
    const ok = (fired: string[]): CaseResult => scoreCase(base, { report: fakeReport(fired), error: null, durationMs: 10, logs: [] }, "llm");
    const results = [ok(["interaction.pairwise/warfarin-nsaid"]), ok(["allergy.cross-reactivity"]), scoreCase(base, { report: null, error: "boom", durationMs: 0, logs: [] }, "llm")];
    const a = aggregate(results);
    expect(a.cases).toMatchObject({ total: 3, ok: 2, error: 1 });
    // case 1: tp 1; case 2: fn 1 + fp 1 (allergy is in this case's absent list)
    expect(a.detection).toMatchObject({ tp: 1, fp: 1, fn: 1 });
    expect(a.detection.precision.value).toBe(0.5);
    expect(a.detection.recall.value).toBe(0.5);
    expect(a.detection.falseNegativeRate.value).toBe(0.5);
  });
});

function fakeReport(firedOrigins: string[], over: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    prescriptionId: "x",
    disposition: firedOrigins.length > 0 ? "MANUAL_REVIEW_NEEDED" : "NO_FLAGS_DETECTED",
    dispositionReason: "r",
    extraction: { patientName: null, patientDateOfBirth: null, prescriberName: null, prescriberIdentifier: null, dateWritten: null, medications: [], statedAllergies: [], notes: null, uncertainties: [], overallConfidence: 0.9, extractor: "fake" },
    findings: firedOrigins.map((origin, i) => finding({ id: `f${i}`, origin, deterministic: true, therapyContext: "ACUTE_SHORT_COURSE" })),
    evidence: [],
    ai: null,
    coverage: { rulesEvaluated: [], referenceDocumentsSearched: 0, retrievalMethod: "LEXICAL", llmUsed: true, limitations: ["Interaction, allergy and condition checks cover only the curated demo tables"] },
    engineVersion: "test",
    startedAt: "",
    completedAt: "",
    ...over,
  };
}

describe("forbiddenWording", () => {
  it("separates rule-authored hits from AI-authored hits and matches whole words only", () => {
    const report = fakeReport([], {
      findings: [
        finding({ id: "rule", origin: "interaction.pairwise/warfarin-nsaid", deterministic: true, explanation: "Therapy context: ongoing (chronic) therapy.", aiContext: "Chronic warfarin user." }),
        finding({ id: "obs", origin: "llm", deterministic: false, type: "AI_OBSERVATION", explanation: "chronically underdosed" }),
      ],
      ai: { model: "m", summary: "no concern", reasoning: "Chronic use noted", reviewQuestions: [], rejectedCitations: [], similarCases: [], promptTokens: null, completionTokens: null, durationMs: 1 },
    });
    const hits = forbiddenWording(report, ["chronic"]);
    expect(hits.deterministicHits).toEqual(['rule title/explanation: "chronic"']);
    // "chronically" is not the word "chronic"; aiContext and ai.reasoning are.
    expect(hits.aiHits).toEqual(['rule aiContext: "chronic"', 'ai.reasoning: "chronic"']);
    expect(forbiddenWording(report, [])).toEqual({ deterministicHits: [], aiHits: [] });
  });
});

describe("leakage check", () => {
  it("canonical JSON is independent of key order, so a JSONB round trip fingerprints the same", () => {
    expect(canonicalJson({ b: [1, { d: 1, c: 2 }], a: null })).toBe('{"a":null,"b":[1,{"c":2,"d":1}]}');
    expect(fingerprint({ x: 1, y: { z: 2, w: 3 } })).toBe(fingerprint({ y: { w: 3, z: 2 }, x: 1 }));
  });

  it("finds collisions by example id, payload id, image hash and ground-truth content, and nothing else", () => {
    const rows = [
      { id: "us-001", payloadId: "us-001", sha256: "aaa", groundTruthFingerprint: "ggg" },
      { id: "rx-001", payloadId: "rx-001", sha256: "bbb", groundTruthFingerprint: null },
    ];
    const leaks = findLeaks(rows, [
      { id: "gen-s7-001", sha256: "zzz", groundTruthFingerprint: "yyy" },
      { id: "us-001", sha256: null, groundTruthFingerprint: null },
      { id: "gen-s7-002", sha256: "aaa", groundTruthFingerprint: null },
      { id: "gen-s7-003", sha256: null, groundTruthFingerprint: "ggg" },
      { id: "cur-text", sha256: null, groundTruthFingerprint: null },
    ]);
    expect(leaks).toEqual({ idCollisions: ["us-001"], sha256Collisions: ["gen-s7-002"], groundTruthCollisions: ["gen-s7-003"] });
  });

  it("a rendered case carries an image hash and a ground-truth fingerprint; a text case carries neither", async () => {
    const rendered = CURATED_CASES.find((c) => c.source.kind === "render")!;
    const { evalCase } = await materializeCase(rendered);
    const fp = evalFingerprint(evalCase);
    expect(fp.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.groundTruthFingerprint).toMatch(/^[0-9a-f]{64}$/);
    const text = CURATED_CASES.find((c) => c.source.kind === "text")!;
    expect(evalFingerprint((await materializeCase(text)).evalCase)).toEqual({ id: text.id, sha256: null, groundTruthFingerprint: null });
  });
});

describe("curated case list", () => {
  it("covers every required scenario with unique ids", () => {
    const scenarios = new Set(CURATED_CASES.map((c) => c.scenario));
    for (const required of REQUIRED_SCENARIOS) expect(scenarios.has(required), required).toBe(true);
    expect(new Set(CURATED_CASES.map((c) => c.id)).size).toBe(CURATED_CASES.length);
  });

  it("only names rule families the engine evaluates, and never expects and bans the same family", () => {
    for (const c of CURATED_CASES) {
      for (const family of [...c.expected.findings, ...c.expected.absent]) {
        expect(ALL_RULE_FAMILIES.some((rule) => originMatches(family, rule)), `${c.id}: ${family}`).toBe(true);
      }
      for (const family of c.expected.findings) expect(c.expected.absent.some((a) => originMatches(family, a)), `${c.id}: ${family}`).toBe(false);
    }
  });

  it("the no-patient case has no patient and the ambiguous-extraction case is a noisy handwritten render", () => {
    expect(CURATED_CASES.find((c) => c.scenario === "NO_PATIENT")!.patient).toBeNull();
    expect(CURATED_CASES.find((c) => c.scenario === "AMBIGUOUS_EXTRACTION")!.source).toMatchObject({ kind: "render", style: "handwritten", difficulty: "noisy" });
    const missing = CURATED_CASES.find((c) => c.scenario === "ALLERGY_HISTORY")!.patient!;
    expect(missing.allergiesVerified === false || missing.allergies.length === 0).toBe(true);
  });
});

describe("label validation", () => {
  const entries = [...Object.values(CASE_VALIDATION), ...Object.values(RULE_LEVEL_VALIDATION)];

  it("every curated case carries the validation entry for its id, and the id list matches the case list both ways", () => {
    const ids = CURATED_CASES.map((c) => c.id);
    expect([...ids].sort()).toEqual([...CURATED_CASE_IDS].sort());
    for (const c of CURATED_CASES) expect(c.validation, c.id).toBe(CASE_VALIDATION[c.id]);
    expect(validationFor("gen-s7-001")).toBeNull();
    expect(validationFor("cur-no-flags")).toBe(CASE_VALIDATION["cur-no-flags"]);
  });

  it("every entry has a status from the closed set, a claim, a note, and at least one https source with a section", () => {
    for (const v of entries) {
      expect(VALIDATION_STATUSES).toContain(v.status);
      expect(v.claim.length).toBeGreaterThan(0);
      expect(v.note.length).toBeGreaterThan(0);
      expect(v.sources.length).toBeGreaterThan(0);
      for (const s of v.sources) {
        expect(s.url, s.title).toMatch(/^https:\/\//);
        expect(s.section.length, s.title).toBeGreaterThan(0);
        expect(s.publisher.length, s.title).toBeGreaterThan(0);
        expect(s.accessed).toBe(ACCESSED_ON);
        expect(ACCESSED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("quotes are at most 15 words, so no source is reproduced beyond a short fragment", () => {
    for (const v of entries) {
      for (const s of v.sources) {
        if (!s.quote) continue;
        expect(s.quote.trim().split(/\s+/).length, `${s.title}: ${s.quote}`).toBeLessThanOrEqual(MAX_QUOTE_WORDS);
      }
    }
  });

  it("a non-CONFIRMED verdict says what differs, and the report shows the label source per curated case", () => {
    for (const v of entries) {
      if (v.status === "CONFIRMED") continue;
      expect(v.note, v.claim).toMatch(/not (supported|backed|found|opened|located|mention)|contradict|higher than|lower than|gap|could not/i);
    }
    const md = renderMarkdown(fakeEvalReport([]));
    expect(md).toContain("## Label sources (0 curated cases");
  });
});

describe("generated held-out set", () => {
  it("refuses the seed of the ingested examples and is reproducible", () => {
    expect(() => generatedCaseSpecs(INGESTED_EXAMPLES_SEED, 1)).toThrow(/ingested/);
    expect(generatedCaseSpecs(7, 5)).toEqual(generatedCaseSpecs(7, 5));
    expect(generatedCaseSpecs(7, 5).map((c) => c.id)).toEqual(["gen-s7-001", "gen-s7-002", "gen-s7-003", "gen-s7-004", "gen-s7-005"]);
  });

  it("expected families come from the injected error and the rules raise them on the ground truth; CLEAN cases expect nothing", () => {
    const specs = generatedCaseSpecs(7, 60);
    const rng = { createRng: null };
    void rng;
    for (const spec of specs) {
      expect(spec.oracleExtraction.medications.length).toBe(spec.groundTruth!.medications.length);
      if (spec.scenario === "CLEAN") {
        expect(spec.expected.findings).toEqual([]);
        expect(spec.expected.absent).toEqual([...SCENARIO_FAMILIES]);
        expect(spec.expected.disposition).toBe("NO_FLAGS_DETECTED");
        continue;
      }
      expect(spec.expected.findings).toHaveLength(1);
      expect(spec.expected.disposition).toBe("MANUAL_REVIEW_NEEDED");
      const label = labelCase({ scenario: spec.scenario as never, groundTruth: spec.groundTruth!, injectedErrors: spec.injectedErrors });
      expect(label.ruleFindings.some((f) => originMatches(f.origin, spec.expected.findings[0]!)), spec.id).toBe(true);
      for (const family of spec.expected.absent) expect(label.ruleFindings.some((f) => originMatches(f.origin, family)), `${spec.id} ${family}`).toBe(false);
    }
  });
});

describe("runner", () => {
  it("oracle mode: every curated case is detected by the deterministic layer with no false alarm, and NO_FLAGS is n/a", async () => {
    const cases = await Promise.all(CURATED_CASES.map(async (c) => (await materializeCase(c)).evalCase));
    const results = await runCases({ pool, llm: null }, cases, { mode: "oracle", concurrency: 3, timeoutMs: 20_000 });
    for (const r of results) {
      expect(r.status, `${r.id}: ${r.error}`).toBe("ok");
      expect(r.detection, r.id).toMatchObject({ fn: 0, fp: 0 });
      expect(r.ai.completed).toBe(false);
      expect(r.systemLimitations).toEqual(["AI contextual analysis did not complete"]);
      expect(r.extraction.score).toBeNull();
      expect(r.wording.deterministicHits, r.id).toEqual([]);
      expect(r.evidenceSections.violations, r.id).toEqual([]);
      expect(r.therapyContext.match, r.id).not.toBe(false);
      expect(r.limitations.match, r.id).not.toBe(false);
    }
    const noFlags = results.find((r) => r.scenario === "NO_FLAGS")!;
    expect(noFlags.disposition).toBe("MANUAL_REVIEW_NEEDED");
    expect(noFlags.dispositionMatch).toBeNull();
    expect(noFlags.detection).toMatchObject({ tp: 0, fp: 0, fn: 0, tn: ALL_RULE_FAMILIES.length });
    const a = aggregate(results);
    expect(a.detection.recall.value).toBe(1);
    expect(a.detection.labelledPositives).toBe(CURATED_CASES.reduce((s, c) => s + c.expected.findings.length, 0));
    // The report renders without throwing and carries the mandatory sections.
    const md = renderMarkdown(fakeEvalReport(results));
    for (const heading of ["## Leakage check", "## Totals", "## Missed expected issues", "## Unsupported alerts", "## Cases requiring manual verification", "## Label sources", "## Extraction accuracy", "## Limitations"]) expect(md).toContain(heading);
    expect(md).toContain("independently verified clinical ground truth");
    // Every curated case gets a "Label source:" row carrying its verdict and at least one URL.
    for (const c of CURATED_CASES) expect(md, c.id).toMatch(new RegExp(`\\| ${c.id} \\| ${c.validation.status} \\| Label source: .*https://`));
  }, 60_000);

  it("llm mode with a scripted model: an uncited observation is an unsupported alert, extraction is scored against ground truth", async () => {
    const spec = CURATED_CASES.find((c) => c.id === "cur-handwritten-noisy")!;
    const { evalCase } = await materializeCase(spec);
    const llm = new FakeLlm([
      spec.oracleExtraction,
      { summary: "s", reasoning: "r", findings: [], additionalObservations: [{ title: "Age over 65 raises bleeding risk", severity: "MODERATE", explanation: "Patient is 74.", citations: [], reviewQuestions: [], medications: ["Motrin"] }], reviewQuestions: [] },
    ]);
    const r = await evaluateCase({ pool, llm }, evalCase, { mode: "llm", timeoutMs: 20_000 });
    expect(r.status, r.error ?? "").toBe("ok");
    expect(r.detection).toMatchObject({ tp: 1, fp: 0, fn: 0, matched: ["interaction.pairwise/warfarin-nsaid"] });
    expect(r.ai).toMatchObject({ completed: true, observations: 1, unsupported: 1, supported: 0, model: "fake/test-model" });
    expect(r.ai.unsupportedTitles[0]).toContain("proposed MODERATE");
    expect(r.extraction.score?.overall).toBe(1);
    expect(r.therapyContext).toMatchObject({ expected: "ACUTE_SHORT_COURSE", observed: ["ACUTE_SHORT_COURSE"], match: true });
    expect(r.evidence.coverage).toBe(1);
    expect(r.dispositionMatch).toBe(true);
    expect(r.manualReview).toBe(true);
    expect(r.pipelineReport?.prescriptionId).toBe(evalCase.id);
  });

  it("a model failure is recorded on the case and never aborts the run", async () => {
    const spec = CURATED_CASES.find((c) => c.id === "cur-no-flags")!;
    const { evalCase } = await materializeCase(spec);
    const results = await runCases({ pool, llm: new FakeLlm([new Error("provider 502")]) }, [evalCase], { mode: "llm", concurrency: 1, timeoutMs: 20_000 });
    expect(results[0]).toMatchObject({ status: "error", detection: null, dispositionMatch: null, pipelineReport: null });
    expect(results[0]!.error).toContain("provider 502");
    expect(aggregate(results).cases).toMatchObject({ total: 1, ok: 0, error: 1 });
  });
});

function fakeEvalReport(results: CaseResult[]): EvalReport {
  return {
    version: "test",
    generatedAt: "now",
    mode: "oracle",
    seed: 7,
    generatedCount: 0,
    engineVersion: "e",
    rulesVersion: "r",
    model: { chat: "oracle", vision: "oracle", embedding: null, observedAnalysis: [], observedExtractors: [] },
    leakage: { checked: true, exampleRows: 0, evalCases: results.length, idCollisions: [], sha256Collisions: [], groundTruthCollisions: [], clean: true, note: "" },
    aggregate: aggregate(results),
    cases: results,
  };
}
