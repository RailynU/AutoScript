import type { AnalysisReport, AnalyzeRequest, Disposition, PatientContext, TherapyContext } from "@autoscript/shared";
import type { RenderDifficulty, RenderStyle } from "../dataset/us/render.js";
import type { ExtractionScore, GroundTruth, InjectedErrorCode } from "../dataset/us/schema.js";
import type { LlmExtraction } from "../extraction/extract.js";
import type { RuleFamily } from "./families.js";

export type EvalSet = "curated" | "generated";
export type EvalMode = "llm" | "oracle";

/** A reference section that must (or must not) be attached to a finding of the case. */
export interface EvidenceSectionRef {
  documentId: string;
  section: string;
}

export interface EvalExpectation {
  /** Rule families that must fire (origin prefixes). */
  findings: RuleFamily[];
  /** Rule families that must not fire; everything else that fires is reported as unlabelled. */
  absent: RuleFamily[];
  /** Therapy context every fired finding of an expected family must carry; null when not asserted. */
  therapyContext: TherapyContext | null;
  /** Substrings that must appear in coverage.limitations. */
  limitations: string[];
  disposition: Disposition;
  /** Words (matched as whole words, case-insensitive) that no finding of the case may contain. */
  forbiddenWords: string[];
  /** Reference sections that must be attached to a finding of an expected family. */
  evidence: EvidenceSectionRef[];
  /** Reference sections that may not be attached to any finding of the case. */
  absentEvidence: EvidenceSectionRef[];
}

export type EvalSourceSpec =
  | { kind: "text"; text: string }
  | { kind: "file"; fileName: string; mimeType: string; base64: string }
  | { kind: "render"; groundTruth: GroundTruth; style: RenderStyle; difficulty: RenderDifficulty; seed: number };

export interface EvalCaseSpec {
  id: string;
  title: string;
  set: EvalSet;
  /** RequiredScenario for hand-written cases, ScenarioKind for generated ones. */
  scenario: string;
  source: EvalSourceSpec;
  patient: PatientContext | null;
  /** The transcription a perfect reader would produce, in the extractor's output schema (used in --no-llm mode). */
  oracleExtraction: LlmExtraction;
  /** Exact content of the rendered image, when the source is an image we rendered ourselves. */
  groundTruth: GroundTruth | null;
  injectedErrors: Array<{ code: InjectedErrorCode; detail: string }>;
  expected: EvalExpectation;
}

/** A case whose source has been rendered to something the pipeline accepts. */
export interface EvalCase extends Omit<EvalCaseSpec, "source"> {
  source: AnalyzeRequest["source"];
  style: RenderStyle | null;
  difficulty: RenderDifficulty | null;
  image: { sha256: string; bytes: number } | null;
}

export interface DetectionResult {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  matched: RuleFamily[];
  missed: RuleFamily[];
  falseAlarms: RuleFamily[];
  /** Fired families that were neither expected nor expected-absent. */
  unlabeled: string[];
}

export interface CaseResult {
  id: string;
  title: string;
  set: EvalSet;
  scenario: string;
  style: RenderStyle | null;
  difficulty: RenderDifficulty | null;
  status: "ok" | "error";
  error: string | null;
  durationMs: number;
  logs: string[];
  disposition: Disposition | null;
  dispositionReason: string | null;
  expectedDisposition: Disposition;
  /** null when not comparable (error, or NO_FLAGS expected in oracle mode where policy forbids it). */
  dispositionMatch: boolean | null;
  manualReview: boolean | null;
  /** Deterministic rule origins that fired (system limitations excluded). */
  firedOrigins: string[];
  systemLimitations: string[];
  detection: DetectionResult | null;
  therapyContext: { expected: TherapyContext | null; observed: string[]; match: boolean | null };
  limitations: { expected: string[]; missing: string[]; match: boolean | null };
  wording: { forbidden: string[]; deterministicHits: string[]; aiHits: string[] };
  evidenceSections: { expectedPresent: number; present: number; expectedAbsent: number; violations: string[] };
  evidence: { deterministicFindings: number; withEvidence: number; coverage: number | null };
  ai: {
    completed: boolean | null;
    model: string | null;
    observations: number;
    supported: number;
    unsupported: number;
    unsupportedTitles: string[];
    rejectedCitations: number;
  };
  extraction: {
    extractor: string | null;
    overallConfidence: number | null;
    medications: Array<{ rawName: string; normalizedName: string | null; confidence: number }>;
    score: ExtractionScore | null;
  };
  retrievalMethod: "VECTOR" | "LEXICAL" | "NONE" | null;
  /** The engine's full report for the case, so every number above can be audited against its source. */
  pipelineReport: AnalysisReport | null;
}

export interface Ratio {
  numerator: number;
  denominator: number;
  /** null when the denominator is 0 ("n/a"). */
  value: number | null;
}

export interface ExtractionGroupStats {
  n: number;
  meanOverall: number;
  medicationsMatched: number;
  medicationsExpected: number;
}

export interface Aggregate {
  cases: { total: number; ok: number; error: number; curated: number; generated: number };
  detection: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    labelledPositives: number;
    labelledNegatives: number;
    precision: Ratio;
    recall: Ratio;
    falseNegativeRate: Ratio;
    specificity: Ratio;
    unlabeledFired: number;
  };
  disposition: Ratio;
  manualReview: Ratio;
  therapyContext: Ratio;
  limitations: Ratio;
  wording: { casesWithRule: number; deterministicViolations: number; aiHits: number };
  evidenceSections: { expectedPresent: number; present: number; expectedAbsent: number; violations: number };
  evidence: Ratio;
  ai: { completed: number; observations: number; supported: number; unsupported: number; rejectedCitations: number };
  extraction: { scored: number; meanOverall: number | null; byGroup: Record<string, ExtractionGroupStats>; byScenario: Record<string, ExtractionGroupStats> };
  retrieval: Record<string, number>;
  meanDurationMs: number | null;
}

export interface LeakageResult {
  /** false when case_examples could not be queried; the report then says so instead of claiming a clean check. */
  checked: boolean;
  exampleRows: number;
  evalCases: number;
  idCollisions: string[];
  sha256Collisions: string[];
  groundTruthCollisions: string[];
  clean: boolean | null;
  note: string;
}

export interface EvalReport {
  version: string;
  generatedAt: string;
  mode: EvalMode;
  seed: number;
  generatedCount: number;
  engineVersion: string;
  rulesVersion: string;
  model: { chat: string; vision: string; embedding: string | null; observedAnalysis: string[]; observedExtractors: string[] };
  leakage: LeakageResult;
  aggregate: Aggregate;
  cases: CaseResult[];
}
