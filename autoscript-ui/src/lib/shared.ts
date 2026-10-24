// ─────────────────────────────────────────────────────────────────────────────
// Client-side mirror of the AutoScript API contracts (autoscript/packages/shared).
// Types only plus the few constants the UI needs; the API validates with zod, the
// client trusts the response shape. Keep in sync with packages/shared/src/*.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ── status.ts ────────────────────────────────────────────────────────────────

/** Automated screening status. `REVIEWED` is a legacy value that is still readable. */
export type PrescriptionStatus = "PROCESSING" | "MANUAL_REVIEW_NEEDED" | "NO_FLAGS_DETECTED" | "REVIEWED" | "FAILED";

/** Pharmacist disposition. None of these values means "approved for dispensing". */
export type ReviewStatus = "PENDING_REVIEW" | "REVIEWED" | "INTERVENTION_REQUIRED" | "INTERVENTION_DOCUMENTED" | "INFO_REQUESTED";

export type ProcessingStage =
  | "QUEUED"
  | "EXTRACTING"
  | "NORMALIZING"
  | "LOADING_CONTEXT"
  | "RUNNING_RULES"
  | "RETRIEVING_EVIDENCE"
  | "AI_ANALYSIS"
  | "FINALIZING"
  | "DONE"
  | "FAILED";

export const PROCESSING_STAGE_ORDER: ProcessingStage[] = [
  "QUEUED",
  "EXTRACTING",
  "NORMALIZING",
  "LOADING_CONTEXT",
  "RUNNING_RULES",
  "RETRIEVING_EVIDENCE",
  "AI_ANALYSIS",
  "FINALIZING",
  "DONE",
];

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  QUEUED: "Queued",
  EXTRACTING: "Extracting prescription",
  NORMALIZING: "Normalizing drug names",
  LOADING_CONTEXT: "Loading patient context",
  RUNNING_RULES: "Running clinical rules",
  RETRIEVING_EVIDENCE: "Retrieving reference evidence",
  AI_ANALYSIS: "AI contextual analysis",
  FINALIZING: "Building review report",
  DONE: "Complete",
  FAILED: "Failed",
};

export type SourceType = "PDF" | "IMAGE" | "TEXT" | "SIMULATED";

// ── patient.ts ───────────────────────────────────────────────────────────────

export interface Allergy {
  id?: string;
  substance: string;
  reaction?: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE" | "UNKNOWN";
  recordedAt?: string | null;
}

export interface Condition {
  id?: string;
  name: string;
  icd10?: string | null;
  status: "ACTIVE" | "RESOLVED";
}

export interface PatientMedication {
  id?: string;
  name: string;
  genericName?: string | null;
  dose?: string | null;
  frequency?: string | null;
  startedAt?: string | null;
  active: boolean;
}

export interface PatientContext {
  id: string;
  firstName: string;
  lastName: string;
  /** ISO yyyy-MM-dd */
  dateOfBirth: string | null;
  sex: "F" | "M" | "X" | "UNKNOWN" | null;
  phone: string | null;
  weightKg: number | null;
  renalFunctionNote?: string | null;
  allergiesVerified: boolean;
  allergies: Allergy[];
  conditions: Condition[];
  medications: PatientMedication[];
}

export type PatientSummary = Pick<PatientContext, "id" | "firstName" | "lastName" | "dateOfBirth" | "phone">;

/** Body for POST /api/patients (AutoScript intake / patient lookup). */
export interface CreatePatient {
  firstName: string;
  lastName: string;
  /** ISO yyyy-MM-dd */
  dateOfBirth: string;
  sex?: "F" | "M" | "X" | "UNKNOWN" | null;
  phone?: string | null;
  weightKg?: number | null;
  allergiesVerified: boolean;
  allergies: Omit<Allergy, "id" | "recordedAt">[];
  conditions: Omit<Condition, "id">[];
  medications: Omit<PatientMedication, "id" | "startedAt">[];
}

// ── extraction.ts ────────────────────────────────────────────────────────────

export interface ExtractedMedication {
  rawName: string;
  normalizedName: string | null;
  normalizationSource: "LOCAL_MAP" | "LLM" | "UNRESOLVED";
  strength: string | null;
  form: string | null;
  route: string | null;
  sig: string | null;
  frequency: string | null;
  quantity: string | null;
  refills: string | null;
  duration: string | null;
  indication: string | null;
  confidence: number;
}

export interface ExtractedPrescription {
  patientName: string | null;
  patientDateOfBirth: string | null;
  prescriberName: string | null;
  prescriberIdentifier: string | null;
  dateWritten: string | null;
  medications: ExtractedMedication[];
  statedAllergies: string[];
  notes: string | null;
  uncertainties: string[];
  overallConfidence: number;
  extractor: string;
}

// ── entry.ts ─────────────────────────────────────────────────────────────────

/** Fields typed by the technician at intake; the engine verifies them against the script. */
export interface EnteredScriptData {
  patientFirstName?: string | null;
  patientLastName?: string | null;
  /** ISO yyyy-MM-dd */
  patientDateOfBirth?: string | null;
  drugName?: string | null;
  directions?: string | null;
  quantity?: number | null;
  daySupply?: number | null;
  refillCount?: number | null;
  prescriberName?: string | null;
  prescriberNpi?: string | null;
  prescriberPhone?: string | null;
}

// ── findings.ts ──────────────────────────────────────────────────────────────

export type Severity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "INFO";

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 5, HIGH: 4, MODERATE: 3, LOW: 2, INFO: 1 };

export type FindingType =
  | "DRUG_INTERACTION"
  | "ALLERGY_CONFLICT"
  | "MISSING_PATIENT_INFO"
  | "MISSING_PRESCRIPTION_INFO"
  | "DUPLICATE_THERAPY"
  | "DOSE_CONCERN"
  | "CONDITION_CONFLICT"
  | "EXTRACTION_UNCERTAINTY"
  | "AI_OBSERVATION"
  | "SYSTEM_LIMITATION"
  | "DATA_ENTRY_MISMATCH";

export type TherapyContext = "ACUTE_SHORT_COURSE" | "CHRONIC" | "UNKNOWN";
export type SeveritySource = "RULE_TABLE" | "AI_PROPOSED" | "AI_PROPOSED_UNSUPPORTED";
export type SupportStatus = "SUPPORTED" | "UNVERIFIED";

export interface EvidenceRef {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
  url: string | null;
  section: string | null;
  excerpt: string;
  retrieval: "VECTOR" | "LEXICAL" | "RULE";
  score: number | null;
}

export interface Finding {
  id: string;
  type: FindingType;
  severity: Severity;
  title: string;
  /** Deterministic rule explanation (engine authored), never LLM authored. */
  explanation: string;
  aiContext: string | null;
  /** Rule id that produced the finding, or "llm" for AI observations. */
  origin: string;
  medications: string[];
  evidence: EvidenceRef[];
  reviewQuestions: string[];
  deterministic: boolean;
  therapyContext?: TherapyContext;
  therapyContextBasis?: string | null;
  severitySource?: SeveritySource;
  supportStatus?: SupportStatus | null;
  proposedSeverity?: Severity | null;
}

export type TracedFinding<T extends Finding = Finding> = T & {
  therapyContext: TherapyContext;
  therapyContextBasis: string | null;
  severitySource: SeveritySource;
  supportStatus: SupportStatus | null;
  proposedSeverity: Severity | null;
};

/** Applies the parse defaults for the traceability fields (findings written before they existed). */
export function fillFindingDefaults<T extends Finding>(f: T): TracedFinding<T> {
  const severitySource: SeveritySource = f.severitySource ?? (f.deterministic ? "RULE_TABLE" : "AI_PROPOSED");
  const supportStatus: SupportStatus | null = f.deterministic ? null : (f.supportStatus ?? (f.evidence.length > 0 ? "SUPPORTED" : "UNVERIFIED"));
  return {
    ...f,
    therapyContext: f.therapyContext ?? "UNKNOWN",
    therapyContextBasis: f.therapyContextBasis ?? null,
    severitySource,
    supportStatus,
    proposedSeverity: f.proposedSeverity ?? null,
  };
}

export type Disposition = "MANUAL_REVIEW_NEEDED" | "NO_FLAGS_DETECTED";

// ── engine.ts ────────────────────────────────────────────────────────────────

export interface SimilarCase {
  id: string;
  dataset: "us-synthetic" | "prescriptions";
  scenario: string | null;
  verdict: "good" | "bad";
  reasons: string[];
  score: number | null;
  retrieval: "VECTOR" | "LEXICAL";
}

export interface AiAnalysis {
  model: string;
  summary: string;
  reasoning: string;
  reviewQuestions: string[];
  rejectedCitations: string[];
  similarCases: SimilarCase[];
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
}

export interface ChecksCoverage {
  rulesEvaluated: string[];
  referenceDocumentsSearched: number;
  retrievalMethod: "VECTOR" | "LEXICAL" | "NONE";
  llmUsed: boolean;
  limitations: string[];
}

export interface AnalysisReport {
  prescriptionId: string;
  disposition: Disposition;
  dispositionReason: string;
  extraction: ExtractedPrescription;
  findings: Finding[];
  evidence: EvidenceRef[];
  ai: AiAnalysis | null;
  coverage: ChecksCoverage;
  engineVersion: string;
  startedAt: string;
  completedAt: string;
}

// ── prescription.ts ──────────────────────────────────────────────────────────

export const REVIEW_KINDS = [
  "NOTE",
  "MARK_REVIEWED",
  "PRESCRIBER_CONTACTED",
  "INFO_REQUESTED",
  "INTERVENTION_DOCUMENTED",
  "REVIEWED_NO_INTERVENTION",
  "INTERVENTION_REQUIRED",
  "OTHER",
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Review status each action kind moves the prescription to; `null` leaves it unchanged. */
export const REVIEW_KIND_TRANSITIONS = {
  NOTE: null,
  MARK_REVIEWED: "REVIEWED",
  PRESCRIBER_CONTACTED: "INFO_REQUESTED",
  INFO_REQUESTED: "INFO_REQUESTED",
  INTERVENTION_DOCUMENTED: "INTERVENTION_DOCUMENTED",
  REVIEWED_NO_INTERVENTION: "REVIEWED",
  INTERVENTION_REQUIRED: "INTERVENTION_REQUIRED",
  OTHER: null,
} as const satisfies Record<ReviewKind, ReviewStatus | null>;

/** Kinds that cannot be recorded without a note. */
export const REVIEW_KINDS_REQUIRING_NOTE = {
  NOTE: true,
  MARK_REVIEWED: false,
  PRESCRIBER_CONTACTED: false,
  INFO_REQUESTED: false,
  INTERVENTION_DOCUMENTED: false,
  REVIEWED_NO_INTERVENTION: false,
  INTERVENTION_REQUIRED: false,
  OTHER: true,
} as const satisfies Record<ReviewKind, boolean>;

export function reviewKindRequiresNote(kind: ReviewKind): boolean {
  return REVIEW_KINDS_REQUIRING_NOTE[kind];
}

export interface Review {
  id: string;
  prescriptionId: string;
  action: ReviewKind;
  pharmacistName: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateReview {
  action: ReviewKind;
  pharmacistName: string;
  notes?: string | null;
}

export interface PrescriptionListItem {
  id: string;
  externalRef: string;
  status: PrescriptionStatus;
  reviewStatus: ReviewStatus;
  sourceType: SourceType;
  fileName: string | null;
  patient: PatientSummary | null;
  medicationSummary: string[];
  findingCount: number;
  highestSeverity: string | null;
  progressStage: ProcessingStage;
  progressMessage: string | null;
  progressPercent: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

export interface PrescriptionDetail extends PrescriptionListItem {
  rawText: string | null;
  mimeType: string | null;
  patientContext: PatientContext | null;
  report: AnalysisReport | null;
  /** What the technician typed at intake (verified against the script by the engine). */
  enteredData: EnteredScriptData | null;
  /** Full review history, newest first. */
  reviews: Review[];
}

export interface DashboardStats {
  processing: number;
  manualReviewNeeded: number;
  noFlagsDetected: number;
  failed: number;
  /** Prescriptions whose review was completed since local midnight. */
  reviewedToday: number;
  total: number;
  pendingReview: number;
  interventionRequired: number;
  infoRequested: number;
  interventionDocumented: number;
  reviewed: number;
}

/** Server-sent event emitted by the API whenever a prescription changes. */
export interface PrescriptionEvent {
  type: "created" | "progress" | "completed" | "failed" | "reviewed";
  prescription: PrescriptionListItem;
}
