// ─────────────────────────────────────────────────────────────────────────────
// Hooks that own prescription data fetched from the backend. Components consume
// these so the UI renders and re-renders purely from backend state.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { prescriptionsApi } from '../api/prescriptions'
import { ApiError } from '../api/client'
import type { ApiPrescription, ApiPrescriptionDetail, ApiStats } from '../api/types'

const POLL_MS = 4000

interface PrescriptionsState {
  data: ApiPrescription[]
  stats: ApiStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Loads prescriptions + stats and keeps them in sync with the backend. Screening runs in
 * the background, so the list is re-polled every few seconds.
 */
export function usePrescriptions(): PrescriptionsState {
  const [data, setData]       = useState<ApiPrescription[]>([])
  const [stats, setStats]     = useState<ApiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([prescriptionsApi.list(), prescriptionsApi.stats()])
      setData(list)
      setStats(st)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load prescriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  return { data, stats, loading, error, refresh: load }
}

/** One prescription's detail; polls while the engine is still processing it. */
export function usePrescriptionDetail(id: string) {
  const [data, setData]   = useState<ApiPrescriptionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await prescriptionsApi.getById(id)
      setData(d)
      setError(null)
      if (d.status === 'PROCESSING') timer.current = setTimeout(load, 1500)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load prescription')
    }
  }, [id])

  useEffect(() => {
    load()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [load])

  return { data, error, reload: load, setData }
}
