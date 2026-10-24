// ─────────────────────────────────────────────────────────────────────────────
// Patient API — every patient-related backend call lives here.
// ─────────────────────────────────────────────────────────────────────────────

import { http, toQuery } from './client'
import type { ApiPatient, CreatePatientRequest, PatientSearchParams } from './types'

export const patientsApi = {
  /** GET /api/patients (optionally filtered). No params → all patients. */
  search(params: PatientSearchParams = {}): Promise<ApiPatient[]> {
    const qs = toQuery({
      firstName: params.firstName,
      lastName:  params.lastName,
      dob:       params.dob,
      phone:     params.phone,
    })
    return http.get<ApiPatient[]>(`/patients${qs}`)
  },

  /** GET /api/patients/{id} */
  getById(id: number): Promise<ApiPatient> {
    return http.get<ApiPatient>(`/patients/${id}`)
  },

  /** POST /api/patients */
  create(body: CreatePatientRequest): Promise<ApiPatient> {
    return http.post<ApiPatient>('/patients', body)
  },

  /** PUT /api/patients/{id} */
  update(id: number, body: CreatePatientRequest): Promise<ApiPatient> {
    return http.put<ApiPatient>(`/patients/${id}`, body)
  },

  /** DELETE /api/patients/{id} */
  remove(id: number): Promise<void> {
    return http.delete<void>(`/patients/${id}`)
  },
}

// ── Derived helpers the UI uses to adapt to patient data ─────────────────────

/** True when more than one patient in a set shares the same phone number. */
export function buildSharedPhoneSet(patients: ApiPatient[]): Set<string> {
  const counts = new Map<string, number>()
  for (const p of patients) {
    const key = normalizePhone(p.phone)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const shared = new Set<string>()
  for (const [k, n] of counts) if (n > 1) shared.add(k)
  return shared
}

export function normalizePhone(phone: string | null): string {
  return (phone ?? '').replace(/[\s\-()+]/g, '')
}

export function isSharedPhone(phone: string | null, sharedSet: Set<string>): boolean {
  const key = normalizePhone(phone)
  return key !== '' && sharedSet.has(key)
}
