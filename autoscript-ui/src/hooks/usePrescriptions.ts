// ─────────────────────────────────────────────────────────────────────────────
// Hooks that own prescription data fetched from the backend. Components consume
// these so the UI renders and re-renders purely from backend state.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { prescriptionsApi } from '../api/prescriptions'
import { ApiError } from '../api/client'
import type { ApiPrescription, ApiStats, PrescriptionStatus } from '../api/types'

interface PrescriptionsState {
  data: ApiPrescription[]
  stats: ApiStats | null
  loading: boolean
  error: string | null
  /** Re-fetch list + stats from the backend. */
  refresh: () => Promise<void>
  /** Change a prescription's status; list + stats update from the response. */
  setStatus: (id: number, status: PrescriptionStatus) => Promise<void>
  /** Server-side search (q matches patient / rxId / medication). */
  search: (query: string) => Promise<void>
}

/** Loads prescriptions + stats and keeps them in sync with the backend. */
export function usePrescriptions(): PrescriptionsState {
  const [data, setData]       = useState<ApiPrescription[]>([])
  const [stats, setStats]     = useState<ApiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async (query = '') => {
    setLoading(true)
    setError(null)
    try {
      const [list, st] = await Promise.all([
        prescriptionsApi.list(query),
        prescriptionsApi.stats(),
      ])
      setData(list)
      setStats(st)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load prescriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => load(), [load])
  const search  = useCallback((q: string) => load(q), [load])

  const setStatus = useCallback(async (id: number, status: PrescriptionStatus) => {
    try {
      const updated = await prescriptionsApi.updateStatus(id, status)
      setData(prev => prev.map(r => (r.id === updated.id ? updated : r)))
      // stats changed too — pull the fresh counts
      setStats(await prescriptionsApi.stats())
    } catch (e) {
      throw e instanceof ApiError ? e : new Error('Status update failed')
    }
  }, [])

  return { data, stats, loading, error, refresh, setStatus, search }
}

/** Lightweight hook for just the dashboard stat counts. */
export function usePrescriptionStats() {
  const [stats, setStats]     = useState<ApiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await prescriptionsApi.stats())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { stats, loading, error, refresh }
}
