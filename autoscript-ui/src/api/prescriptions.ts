// ─────────────────────────────────────────────────────────────────────────────
// Prescription API — intake, screening results, pharmacist review.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, http, toQuery } from './client'
import type {
  ApiPrescription,
  ApiPrescriptionDetail,
  ApiStats,
  ExtractedPrescription,
  PrescriptionStatus,
  ReviewAction,
  ReviewStatus,
  ScriptData,
  Severity,
} from './types'

export const prescriptionsApi = {
  /** GET /api/prescriptions — newest first, optionally filtered. */
  async list(filter: { status?: PrescriptionStatus; reviewStatus?: ReviewStatus } = {}): Promise<ApiPrescription[]> {
    const qs = toQuery({ status: filter.status, reviewStatus: filter.reviewStatus })
    return (await http.get<{ prescriptions: ApiPrescription[] }>(`/prescriptions${qs}`)).prescriptions
  },

  /** GET /api/stats */
  stats(): Promise<ApiStats> {
    return http.get<ApiStats>('/stats')
  },

  /** GET /api/prescriptions/{id} — report, patient context, entered data, review history. */
  async getById(id: string): Promise<ApiPrescriptionDetail> {
    return (await http.get<{ prescription: ApiPrescriptionDetail }>(`/prescriptions/${id}`)).prescription
  },

  /** URL of the original uploaded script. */
  fileUrl(id: string): string {
    return `${API_BASE}/prescriptions/${id}/file`
  },

  /**
   * POST /api/prescriptions/upload — the script image plus the technician's entry.
   * Returns immediately (PROCESSING); the RX Engine screens it in the background.
   */
  async upload(file: File, patientId: string, enteredData: Partial<ScriptData> | null): Promise<ApiPrescription> {
    const form = new FormData()
    form.append('patientId', patientId)
    if (enteredData) form.append('enteredData', JSON.stringify(enteredData))
    form.append('file', file)
    return (await http.form<{ prescription: ApiPrescription }>('/prescriptions/upload', form)).prescription
  },

  /** POST /api/prescriptions/extract — read the script without screening it (Autofill). */
  async extract(file: File): Promise<{ scriptData: ScriptData; extraction: ExtractedPrescription }> {
    const form = new FormData()
    form.append('file', file)
    return http.form('/prescriptions/extract', form)
  },

  /** POST /api/prescriptions/{id}/reviews */
  async addReview(id: string, action: ReviewAction, pharmacistName: string, notes: string | null): Promise<ApiPrescriptionDetail> {
    return (await http.post<{ prescription: ApiPrescriptionDetail }>(`/prescriptions/${id}/reviews`, { action, pharmacistName, notes })).prescription
  },

  /** POST /api/prescriptions/{id}/retry — re-run a failed screening. */
  async retry(id: string): Promise<ApiPrescription> {
    return (await http.post<{ prescription: ApiPrescription }>(`/prescriptions/${id}/retry`, {})).prescription
  },
}

// ── Display metadata derived from backend status values ──────────────────────

export interface StatusMeta {
  label: string
  variant: 'processing' | 'manual' | 'reviewed' | 'cleared' | 'failed'
}

export const STATUS_META: Record<PrescriptionStatus, StatusMeta> = {
  PROCESSING:           { label: 'Processing',           variant: 'processing' },
  MANUAL_REVIEW_NEEDED: { label: 'Manual Review Needed', variant: 'manual' },
  NO_FLAGS_DETECTED:    { label: 'No Flags Detected',    variant: 'cleared' },
  REVIEWED:             { label: 'Reviewed',             variant: 'reviewed' },
  FAILED:               { label: 'Failed',               variant: 'failed' },
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as PrescriptionStatus] ?? { label: status, variant: 'processing' }
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING_REVIEW:          'Pending review',
  REVIEWED:                'Reviewed',
  INTERVENTION_REQUIRED:   'Intervention required',
  INTERVENTION_DOCUMENTED: 'Intervention documented',
  INFO_REQUESTED:          'Info requested',
}

export const REVIEW_ACTIONS: { value: ReviewAction; label: string; needsNote: boolean }[] = [
  { value: 'REVIEWED_NO_INTERVENTION', label: 'Reviewed — no intervention needed', needsNote: false },
  { value: 'INTERVENTION_REQUIRED',    label: 'Intervention required',            needsNote: false },
  { value: 'PRESCRIBER_CONTACTED',     label: 'Prescriber contacted',             needsNote: false },
  { value: 'INFO_REQUESTED',           label: 'Information requested',            needsNote: false },
  { value: 'INTERVENTION_DOCUMENTED',  label: 'Intervention documented',          needsNote: false },
  { value: 'NOTE',                     label: 'Add a note',                       needsNote: true  },
]

export function reviewActionLabel(action: ReviewAction): string {
  return REVIEW_ACTIONS.find(a => a.value === action)?.label ?? (action === 'MARK_REVIEWED' ? 'Marked reviewed' : action)
}

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO']

export function severityRank(s: Severity | null | undefined): number {
  return s ? SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(s) : 0
}

export const FINDING_TYPE_LABEL: Record<string, string> = {
  DRUG_INTERACTION:          'Drug interaction',
  ALLERGY_CONFLICT:          'Allergy conflict',
  DOSE_CONCERN:              'Dose concern',
  CONDITION_CONFLICT:        'Condition conflict',
  DUPLICATE_THERAPY:         'Duplicate therapy',
  MISSING_PATIENT_INFO:      'Missing patient context',
  MISSING_PRESCRIPTION_INFO: 'Missing prescription info',
  EXTRACTION_UNCERTAINTY:    'Extraction uncertainty',
  AI_OBSERVATION:            'AI observation',
  SYSTEM_LIMITATION:         'System limitation',
  DATA_ENTRY_MISMATCH:       'Data entry mismatch',
}
