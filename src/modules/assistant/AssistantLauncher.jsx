import React, { Suspense, lazy, useState } from "react";
import { MessageCircle } from "lucide-react";

// The chat panel pulls in the AI SDK (ai, @ai-sdk/react, zod). Every page mounts the assistant, so loading the
// panel up front put that chunk on every session even though most sessions never open it. This launcher shows
// the same button and only imports the panel on first open (warming it on hover/focus so the click feels instant).
const loadPanel = () => import("./FloatingAssistant.jsx");
const FloatingAssistant = lazy(loadPanel);

function LauncherButton({ onOpen }) {
  return (
    <div className="floating-assistant">
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={loadPanel}
        onFocus={loadPanel}
        className="floating-assistant-toggle"
        aria-label="AI köməkçini aç"
      >
        <MessageCircle size={24} />
      </button>
      <style>{`
        .floating-assistant {
          position: fixed;
          left: 16px;
          bottom: 16px;
          z-index: var(--z-fab, 40);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        .floating-assistant-toggle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, var(--color-primary, #10b981), var(--color-primary-dark, #059669));
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);
        }
        @media (max-width: 640px) {
          .floating-assistant {
            left: 10px;
            bottom: 10px;
          }
        }
      `}</style>
    </div>
  );
}

export default function AssistantLauncher() {
  const [started, setStarted] = useState(false);
  if (!started) return <LauncherButton onOpen={() => setStarted(true)} />;
  return (
    <Suspense fallback={<LauncherButton onOpen={() => {}} />}>
      <FloatingAssistant defaultOpen />
    </Suspense>
  );
}
