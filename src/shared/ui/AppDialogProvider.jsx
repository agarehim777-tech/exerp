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
    {dialog && <div role="presentation" className="app-dialog-provider-backdrop" onMouseDown={() => dialog.kind !== "alert" && close(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" className="app-dialog-provider-panel" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="app-dialog-title" className="app-dialog-provider-title">{dialog.title || (dialog.kind === "confirm" ? "Təsdiq" : dialog.kind === "prompt" ? "Məlumat daxil edin" : "Bildiriş")}</h2>
        <p className="app-dialog-provider-message">{dialog.message}</p>
        {dialog.kind === "prompt" && <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} className="app-dialog-provider-input" onKeyDown={(event) => { if (event.key === "Enter") close(true); }} />}
        <div className="app-dialog-provider-actions">
          {dialog.kind !== "alert" && <button type="button" style={secondary} onClick={() => close(false)}>Ləğv et</button>}
          <button type="button" autoFocus={dialog.kind !== "prompt"} style={dialog.danger ? danger : primary} onClick={() => close(true)}>{dialog.confirmLabel || (dialog.kind === "alert" ? "Bağla" : "Təsdiqlə")}</button>
        </div>
      </section>
    </div>}
  </>;
}

const baseButton = { minHeight: 38, borderRadius: 6, padding: "0 16px", cursor: "pointer", fontWeight: 700 };
const primary = { ...baseButton, border: "1px solid #08765d", background: "#08765d", color: "#fff" };
const danger = { ...baseButton, border: "1px solid #b42318", background: "#b42318", color: "#fff" };
const secondary = { ...baseButton, border: "1px solid #cbd8d3", background: "#fff", color: "#23453a" };
