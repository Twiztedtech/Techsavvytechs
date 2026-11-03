// Standard invoice payment terms for the whole site. Net 15 unless the office picks something else.

export const DEFAULT_PAYMENT_TERMS = "Net 15";
export const PAYMENT_TERM_OPTIONS = ["Due on receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

/** Days until due for a terms label ("Net 15" -> 15, "Due on receipt" -> 0). Unknown labels use the standard. */
export function termsDays(terms?: string): number {
  const text = String(terms || "").trim().toLowerCase();
  if (/^due on receipt$/.test(text)) return 0;
  const match = /^net\s*(\d{1,3})$/.exec(text);
  return match ? Number(match[1]) : termsDays(DEFAULT_PAYMENT_TERMS);
}

/** YYYY-MM-DD due date for an issue date (YYYY-MM-DD) and a terms label. */
export function dueDateFor(issueDate: string, terms?: string): string {
  const start = new Date(`${issueDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return issueDate;
  return new Date(start.getTime() + termsDays(terms) * 86400000).toISOString().slice(0, 10);
}
