// ─────────────────────────────────────────────────────────────────────────────
// Central HTTP client. Every backend call goes through here so there is ONE
// place that owns the base URL, headers, and error handling.
//
// Override the base URL at build time with VITE_API_BASE (see .env). Defaults
// to the local Spring Boot server.
// ─────────────────────────────────────────────────────────────────────────────

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080/api'

/** Error thrown for any non-2xx response, carrying the HTTP status. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Is this a "backend unreachable" network error (vs. an HTTP error)? */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message))
}

/** Read an error body ({ error } / { message } / zod issues) and surface a human message. */
export async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(text)
    const issues = Array.isArray(parsed?.issues) ? parsed.issues.map((i: { message: string }) => i.message).join('; ') : ''
    return [parsed?.error ?? parsed?.message, issues].filter(Boolean).join(': ') || `Server error ${res.status}`
  } catch {
    return text || `Server error ${res.status}`
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: options?.body instanceof FormData ? options?.headers : { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
    })
  } catch (e) {
    // Network-level failure (server down, CORS block, DNS, etc.)
    throw new ApiError(0, 'Could not reach the server. Is the AutoScript API running on port 8080?')
  }

  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))

  // 204 No Content → nothing to parse
  if (res.status === 204) return undefined as T

  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const http = {
  get:    <T>(path: string)            => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)            => request<T>(path, { method: 'DELETE' }),
  form:   <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
}

/** Build a query string from params, skipping blank/undefined values. */
export function toQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v.trim() !== '') sp.set(k, v.trim())
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
