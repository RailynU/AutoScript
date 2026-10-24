// ─────────────────────────────────────────────────────────────────────────────
// Hook that owns patient-search state fetched from the backend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react'
import { patientsApi, buildSharedPhoneSet, isSharedPhone } from '../api/patients'
import { ApiError } from '../api/client'
import type { ApiPatient, CreatePatientRequest, PatientSearchParams } from '../api/types'

interface PatientSearchState {
  /** null = no search run yet; [] = searched, no matches. */
  results: ApiPatient[] | null
  loading: boolean
  error: string | null
  /** Set of normalized phone numbers shared by >1 result (for UI warnings). */
  sharedPhones: Set<string>
  search: (params: PatientSearchParams) => Promise<void>
  create: (body: CreatePatientRequest) => Promise<ApiPatient>
  clear: () => void
  /** Convenience: is this patient's phone shared within the current results? */
  phoneIsShared: (p: ApiPatient) => boolean
}

export function usePatientSearch(): PatientSearchState {
  const [results, setResults]   = useState<ApiPatient[] | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [sharedPhones, setShared] = useState<Set<string>>(new Set())

  const search = useCallback(async (params: PatientSearchParams) => {
    setLoading(true)
    setError(null)
    try {
      const data = await patientsApi.search(params)
      setResults(data)
      setShared(buildSharedPhoneSet(data))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (body: CreatePatientRequest) => {
    try {
      return await patientsApi.create(body)
    } catch (e) {
      throw e instanceof ApiError ? e : new Error('Create failed')
    }
  }, [])

  const clear = useCallback(() => {
    setResults(null)
    setError(null)
    setShared(new Set())
  }, [])

  const phoneIsShared = useCallback(
    (p: ApiPatient) => isSharedPhone(p.phone, sharedPhones),
    [sharedPhones],
  )

  return { results, loading, error, sharedPhones, search, create, clear, phoneIsShared }
}

/** Loads the full patient list (used by the upload modal's picker). */
export function useAllPatients() {
  const [patients, setPatients] = useState<ApiPatient[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPatients(await patientsApi.search())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load patients')
    } finally {
      setLoading(false)
    }
  }, [])

  return { patients, loading, error, load }
}
