export function createClientId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Readable record id such as `SUP-MI6XK2Q1-3FA9C0`: a time part plus a random part, so two records created in the
 * same millisecond, or months apart, never share an id. Replaces `${prefix}-${Date.now()}` (same-ms clashes) and
 * `Date.now().toString().slice(-5)` (repeats every 100 seconds), which let a new record overwrite an older one.
 * @param {string} prefix
 * @returns {string}
 */
export function createPrefixedId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const random = createClientId().replace(/[^0-9a-z]/gi, "").slice(-6).toUpperCase();
  return `${prefix}-${time}-${random}`;
}
