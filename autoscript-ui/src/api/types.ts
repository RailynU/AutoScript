// ─────────────────────────────────────────────────────────────────────────────
// Backend-mirrored types. These match the JSON the Spring Boot API returns.
// Keep this file in sync with the DTOs in com.springray.autoscript.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors Patient entity JSON (incl. @Transient fullName / initials). */
export interface ApiPatient {
  id: number
  firstName: string
  lastName: string
  dob: string               // "MM/DD/YYYY"
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  fullName: string
  initials: string
}

/** Mirrors PrescriptionController.PrescriptionDTO. */
export interface ApiPrescription {
  id: number
  rxId: string
  patientId: number
  patientName: string
  patientDob: string
  medication: string
  dosage: string | null
  instructions: string | null
  status: PrescriptionStatus
  substatus: string | null
  prescriber: string | null
  createdAt: string | null   // ISO-8601
}

/** Mirrors PrescriptionService.stats() map. */
export interface ApiStats {
  reviewed: number
  manual: number
  cleared: number
  processing: number
}

/** The canonical set of statuses the backend uses. */
export type PrescriptionStatus = 'processing' | 'manual' | 'reviewed' | 'cleared'

/** Payload for creating a patient (POST /api/patients). */
export interface CreatePatientRequest {
  firstName: string
  lastName: string
  dob: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

/** Payload for creating a prescription (POST /api/prescriptions). */
export interface CreatePrescriptionRequest {
  patientId: number
  medication: string
  dosage?: string | null
  instructions?: string | null
  prescriber?: string | null
}

/** Query params for the flexible patient search (GET /api/patients). */
export interface PatientSearchParams {
  firstName?: string
  lastName?: string
  dob?: string
  phone?: string
}
