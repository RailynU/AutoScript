// ─────────────────────────────────────────────────────────────────────────────
// Prescription API — every prescription-related backend call lives here.
// ─────────────────────────────────────────────────────────────────────────────

import { http, toQuery } from './client'
import type {
  ApiPrescription,
  ApiStats,
  CreatePrescriptionRequest,
  PrescriptionStatus,
} from './types'

export const prescriptionsApi = {
  /** GET /api/prescriptions?q=  (search, or latest 50 when q is empty). */
  list(query = ''): Promise<ApiPrescription[]> {
    return http.get<ApiPrescription[]>(`/prescriptions${toQuery({ q: query })}`)
  },

  /** GET /api/prescriptions/stats */
  stats(): Promise<ApiStats> {
    return http.get<ApiStats>('/prescriptions/stats')
  },

  /** GET /api/prescriptions/{id} */
  getById(id: number): Promise<ApiPrescription> {
    return http.get<ApiPrescription>(`/prescriptions/${id}`)
  },

  /** GET /api/prescriptions/patient/{patientId} */
  byPatient(patientId: number): Promise<ApiPrescription[]> {
    return http.get<ApiPrescription[]>(`/prescriptions/patient/${patientId}`)
  },

  /** POST /api/prescriptions */
  create(body: CreatePrescriptionRequest): Promise<ApiPrescription> {
    return http.post<ApiPrescription>('/prescriptions', body)
  },

  /** PATCH /api/prescriptions/{id}/status */
  updateStatus(id: number, status: PrescriptionStatus, substatus: string | null = null): Promise<ApiPrescription> {
    return http.patch<ApiPrescription>(`/prescriptions/${id}/status`, { status, substatus })
  },

  /** DELETE /api/prescriptions/{id} */
  remove(id: number): Promise<void> {
    return http.delete<void>(`/prescriptions/${id}`)
  },
}

// ── Display metadata derived from backend status values ──────────────────────
// The UI adapts labels, colors, and icons from whatever status the backend sends.

export interface StatusMeta {
  label: string
  variant: PrescriptionStatus
  icon: string
  cardClass: string
}

export const STATUS_META: Record<PrescriptionStatus, StatusMeta> = {
  reviewed:   { label: 'Reviewed Today',        variant: 'reviewed',   icon: '📋', cardClass: 'green'  },
  manual:     { label: 'Manual Review Needed',  variant: 'manual',     icon: '⚠️', cardClass: 'orange' },
  cleared:    { label: 'Cleared',               variant: 'cleared',    icon: '✅', cardClass: 'blue'   },
  processing: { label: 'Processing',            variant: 'processing', icon: '⏳', cardClass: 'purple' },
}

/** Safely resolve metadata for any status string the backend might send. */
export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as PrescriptionStatus] ?? {
    label: status, variant: 'processing', icon: '•', cardClass: 'purple',
  }
}
