// ─────────────────────────────────────────────────────────────────────────────
// Patient API — every patient-related backend call lives here.
// ─────────────────────────────────────────────────────────────────────────────

import { http, toQuery } from './client'
import type { ApiPatient, ApiPatientContext, CreatePatientRequest, PatientSearchParams } from './types'

export const patientsApi = {
  /** GET /api/patients — any combination of name / DOB / phone, partial matches. */
  async search(params: PatientSearchParams = {}): Promise<ApiPatient[]> {
    const qs = toQuery({
      firstName: params.firstName,
      lastName:  params.lastName,
      dob:       params.dob,
      phone:     params.phone,
      limit:     '50',
    })
    return (await http.get<{ patients: ApiPatient[] }>(`/patients${qs}`)).patients
  },

  /** GET /api/patients/{id} — full clinical profile (allergies, conditions, medications). */
  async getById(id: string): Promise<ApiPatientContext> {
    return (await http.get<{ patient: ApiPatientContext }>(`/patients/${id}`)).patient
  },

  /** POST /api/patients */
  async create(body: CreatePatientRequest): Promise<ApiPatientContext> {
    return (await http.post<{ patient: ApiPatientContext }>('/patients', body)).patient
  },
}

// ── Derived helpers the UI uses to adapt to patient data ─────────────────────

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`
}

/** ISO yyyy-MM-dd → MM/DD/YYYY for display. */
export function formatDob(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso ?? '—')
}

/** MM/DD/YYYY (or ISO) → ISO yyyy-MM-dd; null when unparseable. */
export function toIsoDob(dob: string | null | undefined): string | null {
  if (!dob) return null
  const s = dob.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

export function normalizePhone(phone: string | null): string {
  return (phone ?? '').replace(/\D/g, '')
}

/** "Penicillin (rash), Sulfa" → allergy entries; "NKDA" stays as an entry (counts as verified none). */
export function parseList(text: string): string[] {
  return text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
}
