// ─────────────────────────────────────────────────────────────────────────────
// Backend-mirrored types. These match the JSON the AutoScript API returns.
// Keep this file in sync with autoscript/packages/shared (zod contracts).
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'INFO'

/** Automated screening status (what the RX Engine concluded). */
export type PrescriptionStatus =
  | 'PROCESSING'
  | 'MANUAL_REVIEW_NEEDED'
  | 'NO_FLAGS_DETECTED'
  | 'REVIEWED'
  | 'FAILED'

/** Pharmacist disposition. None of these means "approved for dispensing". */
export type ReviewStatus =
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'INTERVENTION_REQUIRED'
  | 'INTERVENTION_DOCUMENTED'
  | 'INFO_REQUESTED'

export type ReviewAction =
  | 'NOTE'
  | 'PRESCRIBER_CONTACTED'
  | 'INFO_REQUESTED'
  | 'INTERVENTION_DOCUMENTED'
  | 'REVIEWED_NO_INTERVENTION'
  | 'INTERVENTION_REQUIRED'
  | 'OTHER'
  | 'MARK_REVIEWED'

export interface ApiAllergy {
  id?: string
  substance: string
  reaction?: string | null
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN'
  recordedAt?: string | null
}

export interface ApiCondition { id?: string; name: string; icd10?: string | null; status: 'ACTIVE' | 'RESOLVED' }

export interface ApiPatientMedication {
  id?: string
  name: string
  genericName?: string | null
  dose?: string | null
  frequency?: string | null
  active: boolean
}

/** Mirrors PatientSummary. dateOfBirth is ISO yyyy-MM-dd. */
export interface ApiPatient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  phone: string | null
}

/** Mirrors PatientContext (full clinical profile). */
export interface ApiPatientContext extends ApiPatient {
  sex: 'F' | 'M' | 'X' | 'UNKNOWN' | null
  weightKg: number | null
  renalFunctionNote?: string | null
  allergiesVerified: boolean
  allergies: ApiAllergy[]
  conditions: ApiCondition[]
  medications: ApiPatientMedication[]
}

export interface EvidenceRef {
  chunkId: string
  documentId: string
  title: string
  source: string
  url: string | null
  section: string | null
  excerpt: string
  retrieval: 'VECTOR' | 'LEXICAL' | 'RULE'
  score: number | null
}

export interface ApiFinding {
  id: string
  type: string
  severity: Severity
  title: string
  explanation: string
  aiContext: string | null
  origin: string
  medications: string[]
  evidence: EvidenceRef[]
  reviewQuestions: string[]
  deterministic: boolean
  severitySource?: 'RULE_TABLE' | 'AI_PROPOSED' | 'AI_PROPOSED_UNSUPPORTED'
  supportStatus?: 'SUPPORTED' | 'UNVERIFIED' | null
}

export interface ExtractedMedication {
  rawName: string
  normalizedName: string | null
  strength: string | null
  sig: string | null
  frequency: string | null
  quantity: string | null
  refills: string | null
  duration: string | null
  confidence: number
}

export interface ExtractedPrescription {
  patientName: string | null
  patientDateOfBirth: string | null
  prescriberName: string | null
  prescriberIdentifier: string | null
  dateWritten: string | null
  medications: ExtractedMedication[]
  statedAllergies: string[]
  uncertainties: string[]
  overallConfidence: number
  extractor: string
}

export interface AnalysisReport {
  disposition: 'MANUAL_REVIEW_NEEDED' | 'NO_FLAGS_DETECTED'
  dispositionReason: string
  extraction: ExtractedPrescription
  findings: ApiFinding[]
  ai: { model: string; summary: string; reasoning: string; reviewQuestions: string[] } | null
  coverage: { rulesEvaluated: string[]; retrievalMethod: 'VECTOR' | 'LEXICAL' | 'NONE'; llmUsed: boolean; limitations: string[] }
  engineVersion: string
  completedAt: string
}

/** Technician manual entry (mirrors EnteredScriptData). */
export interface ScriptData {
  patientFirstName: string | null
  patientLastName: string | null
  patientDateOfBirth: string | null   // ISO yyyy-MM-dd
  drugName: string | null
  directions: string | null
  quantity: number | null
  daySupply: number | null
  refillCount: number | null
  prescriberName: string | null
  prescriberNpi: string | null
  prescriberPhone: string | null
}

export interface ApiReview {
  id: string
  action: ReviewAction
  pharmacistName: string
  notes: string | null
  createdAt: string
}

/** Mirrors PrescriptionListItem. */
export interface ApiPrescription {
  id: string
  externalRef: string
  status: PrescriptionStatus
  reviewStatus: ReviewStatus
  sourceType: 'PDF' | 'IMAGE' | 'TEXT' | 'SIMULATED'
  fileName: string | null
  patient: ApiPatient | null
  medicationSummary: string[]
  findingCount: number
  highestSeverity: Severity | null
  progressStage: string
  progressMessage: string | null
  progressPercent: number
  failureReason: string | null
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
}

/** Mirrors PrescriptionDetail. */
export interface ApiPrescriptionDetail extends ApiPrescription {
  rawText: string | null
  mimeType: string | null
  patientContext: ApiPatientContext | null
  report: AnalysisReport | null
  enteredData: ScriptData | null
  reviews: ApiReview[]
}

/** Mirrors DashboardStats. */
export interface ApiStats {
  processing: number
  manualReviewNeeded: number
  noFlagsDetected: number
  failed: number
  reviewedToday: number
  total: number
  pendingReview: number
  interventionRequired: number
  infoRequested: number
  interventionDocumented: number
  reviewed: number
}

/** Payload for creating a patient (POST /api/patients). */
export interface CreatePatientRequest {
  firstName: string
  lastName: string
  dateOfBirth: string            // ISO yyyy-MM-dd
  phone?: string | null
  sex?: 'F' | 'M' | 'X' | 'UNKNOWN' | null
  allergiesVerified: boolean
  allergies: Omit<ApiAllergy, 'id' | 'recordedAt'>[]
  conditions: Omit<ApiCondition, 'id'>[]
  medications: Omit<ApiPatientMedication, 'id'>[]
}

/** Query params for the flexible patient search (GET /api/patients). */
export interface PatientSearchParams {
  firstName?: string
  lastName?: string
  dob?: string
  phone?: string
}
