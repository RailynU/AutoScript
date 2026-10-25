/** How many suggested questions a finding card shows before folding the rest. */
export const MAX_VISIBLE_QUESTIONS = 3;

/**
 * Splits an engine explanation into the first sentence (shown) and the rest (folded).
 * A sentence ends at ". ", "! " or "? " followed by an upper-case letter, a quote or a digit.
 */
export function splitLead(text: string): { lead: string; rest: string | null } {
  const trimmed = text.trim();
  const m = /[.!?]["')\]]?(?=\s+["'(A-Z0-9])/.exec(trimmed);
  if (!m) return { lead: trimmed, rest: null };
  const end = m.index + m[0].length;
  const rest = trimmed.slice(end).trim();
  return { lead: trimmed.slice(0, end), rest: rest.length > 0 ? rest : null };
}

export function splitQuestions(questions: readonly string[], max = MAX_VISIBLE_QUESTIONS): { visible: string[]; folded: string[] } {
  return { visible: questions.slice(0, max), folded: questions.slice(max) };
}
