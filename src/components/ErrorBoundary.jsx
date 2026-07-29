import React from "react";
import { logger } from "../lib/logger";
import { captureError } from "../lib/observability";

const chunkErrorPattern = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;
const chunkRecoveryKey = "erp.chunk-recovery";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, eventId: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    const componentStack = info?.componentStack;
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error?.message, {
      stack: error?.stack,
      componentStack,
    });
    logger.fatal(error?.message || "Render error", { componentStack }, error?.stack);
    captureError(error, { componentStack });

    if (chunkErrorPattern.test(String(error?.message || error))) {
      const lastRecovery = Number(sessionStorage.getItem(chunkRecoveryKey) || 0);
      if (Date.now() - lastRecovery > 30_000) {
        sessionStorage.setItem(chunkRecoveryKey, String(Date.now()));
        Promise.resolve()
          .then(async () => {
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.allSettled(registrations.map((registration) => registration.update()));
            }
          })
          .finally(() => window.location.reload());
      }
    }
  }
  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <main style={wrap}>
          <div style={card}>
            <h1 style={{ fontFamily: "Sora, sans-serif", color: "#b23a3a", margin: 0, fontSize: 22 }}>
              Bir problem yarandı
            </h1>
            <p style={{ color: "#5f7a70", marginTop: 10, fontSize: 14 }}>
              Xəta qeydə alındı və komandaya bildirilib.
            </p>
            <pre style={pre}>{String(this.state.error?.message || this.state.error)}</pre>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={this.reset} style={btn}>Yenidən cəhd</button>
              <button onClick={() => (window.location.href = import.meta.env.BASE_URL || "/")} style={{ ...btn, background: "#fff", color: "#064e3b", border: "1px solid #d4c9a3" }}>Ana səhifə</button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e0", fontFamily: "Manrope, system-ui" };
const card = { background: "#fff", padding: 28, borderRadius: 22, boxShadow: "0 18px 44px rgba(6,78,59,0.14)", width: "min(560px, 92vw)", border: "1px solid #e6dfc9" };
const pre = { marginTop: 14, background: "#faf6ea", padding: 12, borderRadius: 12, fontSize: 12, color: "#0f2a20", maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" };
const btn = { padding: "10px 14px", borderRadius: 12, background: "linear-gradient(135deg,#0d7a5f,#064e3b)", color: "#f5f0e0", border: 0, cursor: "pointer", fontWeight: 700, fontFamily: "Sora, sans-serif" };
