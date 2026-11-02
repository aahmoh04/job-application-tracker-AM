/**
 * Helpers for the mail templates. They are functions rather than React
 * components, because react-dom/server refuses to load in the server layer
 * where Route Handlers and Server Actions run.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Makes anything a user typed safe to put into HTML, as text and in attributes. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** One line, whatever was typed. A line break has no business in a header. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
