// ─────────────────────────────────────────────────────────────────────────────
// Script AI API — autofill (image → extracted fields) and review.
// These hit the gated script-reviewer endpoints (require autoscript.ai.enabled).
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, ApiError } from './client'

/** Fields the AI extraction returns (mirrors backend ScriptData). */
export interface ScriptData {
  patientFirstName: string | null
  patientLastName:  string | null
  patientDateOfBirth: string | null
  drugName:     string | null
  directions:   string | null
  quantity:     number | null
  daySupply:    number | null
  refillCount:  number | null
  prescriberName:  string | null
  prescriberNpi:   string | null
  prescriberPhone: string | null
}

/** A single field-level mismatch between entered data and the script image. */
export interface Flag {
  field: string
  description: string
}

/** Result of a review (mirrors backend ReviewResult). */
export interface ReviewResult {
  scriptId: string
  status: string
  reviewedAt: string
  flags: Flag[]
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
   * POST /api/scripts/review  (multipart) — send the prescription image plus the
   * entered fields as a JSON `scriptData` part. The backend extracts the image and
   * compares it field-by-field against the entered values, returning a ReviewResult
   * whose `flags` list every mismatch. Requires autoscript.ai.enabled on the server.
   */
  async review(image: File, scriptData: Partial<ScriptData>): Promise<ReviewResult> {
    const form = new FormData()
    form.append('image', image)
    // The scriptData part must carry a JSON content type so the backend's
    // @RequestPart ScriptData binds it correctly.
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
      // Error bodies are { code, message } — surface the message when present.
      const text = await res.text().catch(() => '')
      let message = text || `Review failed (${res.status})`
      try {
        const parsed = JSON.parse(text)
        if (parsed?.message) message = parsed.message
      } catch { /* not JSON — use raw text */ }
      throw new ApiError(res.status, message)
    }
    return res.json() as Promise<ReviewResult>
  },
}
