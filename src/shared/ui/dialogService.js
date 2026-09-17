let listener = null;
const pending = [];

function request(options) {
  return new Promise((resolve) => {
    pending.push({ ...options, resolve });
    listener?.();
  });
}

export const appAlert = (message, options = {}) => request({ kind: "alert", message, ...options });
export const appConfirm = (message, options = {}) => request({ kind: "confirm", message, ...options });
export const appPrompt = (message, defaultValue = "", options = {}) => request({ kind: "prompt", message, defaultValue, ...options });

export function subscribeDialogs(next) {
  listener = next;
  next();
  return () => { if (listener === next) listener = null; };
}

export const peekDialog = () => pending[0] || null;

export function settleDialog(value) {
  const current = pending.shift();
  current?.resolve(value);
  listener?.();
}
