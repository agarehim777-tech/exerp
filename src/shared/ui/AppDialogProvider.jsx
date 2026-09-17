import React, { useEffect, useState } from "react";
import { peekDialog, settleDialog, subscribeDialogs } from "./dialogService.js";

export default function AppDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState("");

  useEffect(() => subscribeDialogs(() => {
    const next = peekDialog();
    setDialog(next);
    setValue(next?.defaultValue || "");
  }), []);

  const close = (accepted) => {
    if (dialog?.kind === "prompt") settleDialog(accepted ? value.trim() : null);
    else if (dialog?.kind === "confirm") settleDialog(Boolean(accepted));
    else settleDialog(true);
  };

  return <>
    {children}
    {dialog && <div role="presentation" style={backdrop} onMouseDown={() => dialog.kind !== "alert" && close(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" style={panel} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="app-dialog-title" style={title}>{dialog.title || (dialog.kind === "confirm" ? "Təsdiq" : dialog.kind === "prompt" ? "Məlumat daxil edin" : "Bildiriş")}</h2>
        <p style={message}>{dialog.message}</p>
        {dialog.kind === "prompt" && <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} style={input} onKeyDown={(event) => { if (event.key === "Enter") close(true); }} />}
        <div style={actions}>
          {dialog.kind !== "alert" && <button type="button" style={secondary} onClick={() => close(false)}>Ləğv et</button>}
          <button type="button" autoFocus={dialog.kind !== "prompt"} style={dialog.danger ? danger : primary} onClick={() => close(true)}>{dialog.confirmLabel || (dialog.kind === "alert" ? "Bağla" : "Təsdiqlə")}</button>
        </div>
      </section>
    </div>}
  </>;
}

const backdrop = { position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", padding: 16, background: "rgba(15, 42, 32, .42)", backdropFilter: "blur(2px)" };
const panel = { width: "min(440px, 100%)", borderRadius: 8, border: "1px solid #d8e1dd", background: "#fff", boxShadow: "0 24px 70px rgba(15, 42, 32, .24)", padding: 20, fontFamily: "Manrope, system-ui, sans-serif" };
const title = { margin: 0, color: "#12352b", fontSize: 18, letterSpacing: 0 };
const message = { margin: "10px 0 18px", color: "#52675f", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" };
const input = { boxSizing: "border-box", width: "100%", height: 38, margin: "0 0 18px", border: "1px solid #b9c9c3", borderRadius: 6, padding: "0 10px", fontSize: 14 };
const actions = { display: "flex", justifyContent: "flex-end", gap: 8 };
const baseButton = { minHeight: 38, borderRadius: 6, padding: "0 16px", cursor: "pointer", fontWeight: 700 };
const primary = { ...baseButton, border: "1px solid #08765d", background: "#08765d", color: "#fff" };
const danger = { ...baseButton, border: "1px solid #b42318", background: "#b42318", color: "#fff" };
const secondary = { ...baseButton, border: "1px solid #cbd8d3", background: "#fff", color: "#23453a" };
