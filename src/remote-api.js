const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
const sessionKey = "erpaz.remote.session.v1";

export const remoteApiEnabled = Boolean(apiBaseUrl);

export function getRemoteToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(sessionKey) || "";
}

export function setRemoteToken(token) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(sessionKey, token);
  else window.sessionStorage.removeItem(sessionKey);
}

async function request(path, options = {}) {
  const token = options.token || getRemoteToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "API sorğusu uğursuz oldu.");
  return payload;
}

export function loginRemote(email, password) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }), token: "" });
}

export function logoutRemote() {
  return request("/api/auth/logout", { method: "POST" });
}

export function loadRemoteState() {
  return request("/api/state");
}

export function getRemoteSession() {
  return request("/api/session");
}

export function saveRemoteState(state) {
  return request("/api/state", { method: "PUT", body: JSON.stringify({ state }) });
}

export function createRemoteUser(values) {
  return request("/api/users", { method: "POST", body: JSON.stringify(values) });
}
