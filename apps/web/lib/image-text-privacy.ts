/** Text-preserving normalization and best-effort identifier redaction, not NLU. */
export function sanitizeImageText(text: string): string {
  return text.normalize("NFKC").replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\b((?:(?:upi\s+)?transaction|reference|ref\.?|utr|account|a\/c|card)(?:\s+(?:id|number|no\.?))?)[ :#-]*(?:\n[ \t]*)?([A-Z0-9][A-Z0-9 -]*\d[A-Z0-9-]*)/gi, "$1 [REDACTED]")
    .replace(/\b[a-z0-9._-]+@[a-z][a-z0-9.-]+\b/gi, "[REDACTED]")
    .replace(/(?:[xX*•]{2,})[ -]*\d{2,}/g, "[REDACTED]")
    .replace(/(?<!\d)(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g, "[REDACTED]")
    .replace(/\b\d{9,}\b/g, "[REDACTED]")
    .split("\n").map(line => line.trim()).filter(Boolean).join("\n").trim();
}
