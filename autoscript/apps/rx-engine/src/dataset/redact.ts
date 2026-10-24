/**
 * Replaces contact details with "[redacted]" anywhere inside a JSON-like value.
 * Names are kept on purpose: the dataset exists to check that names are transcribed.
 */
const REDACTED = "[redacted]";
const PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // emails
  /\b(?:https?:\/\/|www\.)\S+/gi, // urls
  /\b(?:lic(?:ense|\.)?|reg(?:istration|\.)?|npi|dea|ptr)\s*(?:no\.?|#|:)?\s*[a-z]?\d[\d-]{3,}/gi, // license / registration numbers
  /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)\d{3,5}[\s-]?\d{3,5}\b/g, // phone numbers (7+ digits in groups)
];

export function redactString(text: string): { value: string; changed: boolean } {
  let value = text;
  for (const p of PATTERNS) value = value.replace(p, REDACTED);
  return { value, changed: value !== text };
}

export function redactDeep<T>(input: T): { value: T; changed: boolean } {
  let changed = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = redactString(v);
      changed ||= r.changed;
      return r.value;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(input) as T, changed };
}
