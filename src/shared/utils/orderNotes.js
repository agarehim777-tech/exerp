const PREFIX = "[[ERP_ORDER_NOTES_V1]]";

export function serializeOrderNotes(general = "", internalNotes = []) {
  const notes = internalNotes
    .map((item) => ({ recipient: String(item.recipient || "Ümumi").trim(), text: String(item.text || "").trim() }))
    .filter((item) => item.text);
  const plain = String(general || "").trim();
  if (!notes.length) return plain || null;
  return `${PREFIX}${JSON.stringify({ general: plain, internalNotes: notes })}`;
}

export function parseOrderNotes(value) {
  const text = String(value || "");
  if (!text.startsWith(PREFIX)) return { general: text, internalNotes: [] };
  try {
    const parsed = JSON.parse(text.slice(PREFIX.length));
    return {
      general: String(parsed.general || ""),
      internalNotes: Array.isArray(parsed.internalNotes) ? parsed.internalNotes : [],
    };
  } catch {
    return { general: text, internalNotes: [] };
  }
}
