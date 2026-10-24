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
}
