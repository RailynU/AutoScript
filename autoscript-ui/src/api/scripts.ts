// ─────────────────────────────────────────────────────────────────────────────
// Script AI API — autofill (image → extracted fields) and review.
// These hit the gated script-reviewer endpoints (require autoscript.ai.enabled).
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, ApiError } from './client'

/** Fields the AI extraction returns / review consumes (mirrors backend ScriptData). */
export interface ScriptData {
  patientFirstName: string | null
  patientLastName:  string | null
  patientDateOfBirth: string | null   // ISO yyyy-MM-dd (backend LocalDate)
  drugName:     string | null
  directions:   string | null
  quantity:     number | null
  daySupply:    number | null
  refillCount:  number | null
  prescriberName:  string | null
  prescriberNpi:   string | null
  prescriberPhone: string | null
}

/** A single issue flagged during review (mirrors backend Flag). */
export interface Flag {
  field: string
  description: string
  /** Where the severity came from. Deterministic rule flags are "RULE_TABLE". */
  severitySource: string
}

/** Result of a script review (mirrors backend ReviewResult). */
export interface ReviewResult {
  scriptId: string
  status: string
  reviewedAt: string
  flags: Flag[]
  /**
   * Human summary. When there are no flags this is exactly
   * "No flags detected within checked criteria" — the system never says "safe".
   */
  summary: string
}

export const scriptsApi = {
  /**
   * POST /api/scripts/autofill  (multipart) — send the prescription image,
   * get back extracted fields. Throws ApiError if AI is not configured (the
   * endpoint only exists when autoscript.ai.enabled=true).
   */
  async autofill(image: File): Promise<ScriptData> {
    const form = new FormData()
    form.append('image', image)
    let res: Response
    try {
      res = await fetch(`${API_BASE}/scripts/autofill`, { method: 'POST', body: form })
    } catch {
      throw new ApiError(0, 'Could not reach the server for autofill.')
    }
    if (res.status === 404) {
      throw new ApiError(404, 'AI autofill is not enabled on the server. Enter the details manually.')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body || `Autofill failed (${res.status})`)
    }
    return res.json() as Promise<ScriptData>
  },

  /**
   * POST /api/scripts/review  (multipart) — send the image plus the
   * manually-entered/verified scriptData. The backend extracts from the image,
   * compares against scriptData, and returns a ReviewResult with any flags.
   * The scriptData part must be JSON (Content-Type application/json).
   */
  async review(image: File, scriptData: ScriptData): Promise<ReviewResult> {
    const form = new FormData()
    form.append('image', image)
    form.append(
      'scriptData',
      new Blob([JSON.stringify(scriptData)], { type: 'application/json' }),
    )
    let res: Response
    try {
      res = await fetch(`${API_BASE}/scripts/review`, { method: 'POST', body: form })
    } catch {
      throw new ApiError(0, 'Could not reach the server for review.')
    }
    if (res.status === 404) {
      throw new ApiError(404, 'AI review is not enabled on the server.')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body || `Review failed (${res.status})`)
    }
    return res.json() as Promise<ReviewResult>
  },
}
