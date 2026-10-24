// ─────────────────────────────────────────────────────────────────────────────
// Deterministic avatar styling derived from backend patient data.
// Same patient id → same color, every render.
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#3b82f6,#2563eb)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#14b8a6,#0d9488)',
  'linear-gradient(135deg,#f97316,#ea580c)',
]

/** Patient ids are UUIDs; hash them to a stable palette index. */
export function avatarColor(id: string | number): string {
  const s = String(id)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? '?'}${lastName?.[0] ?? '?'}`.toUpperCase()
}
