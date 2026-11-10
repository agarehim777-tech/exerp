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
        <main className="error-boundary-wrap">
          <div className="error-boundary-card">
            <h1 className="u-font-family-Sora_sans_serif u-color-b23a3a u-margin-0 u-font-size-22px">
              Bir problem yarandı
            </h1>
            <p className="u-color-5f7a70 u-margin-top-10px u-font-size-14px">
              Xəta qeydə alındı və komandaya bildirilib.
            </p>
            <pre className="error-boundary-pre">{String(this.state.error?.message || this.state.error)}</pre>
            <div className="u-display-flex u-gap-10px u-margin-top-14px">
              <button onClick={this.reset} className="error-boundary-btn">Yenidən cəhd</button>
              <button onClick={() => (window.location.href = import.meta.env.BASE_URL || "/")} className="error-boundary-btn sx-0695ff9 sx-7c2de19 sx-ddc9f87">Ana səhifə</button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

