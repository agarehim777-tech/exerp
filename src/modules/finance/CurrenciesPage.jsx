import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useCurrencies } from "../../shared/hooks/useCurrencies.js";
import {
  badge, card, input, msgBox, primaryBtn, secondaryBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const today = () => new Date().toISOString().slice(0, 10);

export default function CurrenciesPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const fx = useCurrencies(tenantId);
  const [form, setForm] = useState({ code: "", name: "", symbol: "" });
  const [rateForm, setRateForm] = useState({ currency_code: "", rate_date: today(), rate: "" });
  const [msg, setMsg] = useState(null);

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  const run = async (fn, ok) => {
    try { await fn(); setMsg({ type: "ok", text: ok }); }
    catch (e) { setMsg({ type: "err", text: e.message || String(e) }); }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {msg && <div style={msgBox}>{msg.text}</div>}
      {fx.degraded && <div style={msgBox}>Canlı yenilənmə kəsildi — məlumatlar avtomatik yenidən sinxronlaşdırılır…</div>}
      {fx.error && <div style={msgBox}>Xəta: {fx.error}</div>}

      <div style={card}>
        <h3 style={{ margin: "0 0 4px" }}>Valyutalar</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.7 }}>
          Əsas valyuta: <strong>{fx.baseCurrency?.code || "—"}</strong>. Digər valyutalar məzənnə ilə əsas valyutaya çevrilir.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Kod
            <input style={{ ...input, width: 110 }} value={form.code} placeholder="USD"
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Ad
            <input style={{ ...input, width: 200 }} value={form.name} placeholder="ABŞ dolları"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Simvol
            <input style={{ ...input, width: 90 }} value={form.symbol} placeholder="$"
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} />
          </label>
          <button type="button" style={primaryBtn} disabled={!form.code}
            onClick={() => run(async () => { await fx.addCurrency(form); setForm({ code: "", name: "", symbol: "" }); }, "Valyuta əlavə olundu.")}>
            Əlavə et
          </button>
        </div>

        <table style={table}>
          <thead>
            <tr><th style={th}>KOD</th><th style={th}>AD</th><th style={th}>SİMVOL</th><th style={th}>CARİ MƏZƏNNƏ</th><th style={th}>STATUS</th><th style={th} /></tr>
          </thead>
          <tbody>
            {fx.currencies.map((c) => (
              <tr key={c.id}>
                <td style={td}><strong>{c.code}</strong></td>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.symbol || "—"}</td>
                <td style={td}>{c.is_base ? "1.000000 (əsas)" : fx.rateFor(c.code).toFixed(6)}</td>
                <td style={td}>
                  <span style={badge(c.is_active ? "green" : "gray")}>{c.is_active ? "Aktiv" : "Deaktiv"}</span>
                  {c.is_base && <span style={{ marginLeft: 6, ...badge("amber") }}>Əsas</span>}
                </td>
                <td style={td}>
                  {!c.is_base && (
                    <button type="button" style={secondaryBtn}
                      onClick={() => run(() => fx.toggleActive(c.id, !c.is_active), "Yeniləndi.")}>
                      {c.is_active ? "Deaktiv et" : "Aktiv et"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!fx.currencies.length && <tr><td style={td} colSpan={6}>Valyuta yoxdur.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h3 style={{ margin: "0 0 12px" }}>Məzənnə tarixçəsi</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Valyuta
            <select style={{ ...input, width: 130 }} value={rateForm.currency_code}
              onChange={(e) => setRateForm((f) => ({ ...f, currency_code: e.target.value }))}>
              <option value="">Seçin</option>
              {fx.currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Tarix
            <input type="date" style={{ ...input, width: 160 }} value={rateForm.rate_date}
              onChange={(e) => setRateForm((f) => ({ ...f, rate_date: e.target.value }))} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Məzənnə ({fx.baseCurrency?.code || "əsas"})
            <input type="number" step="0.000001" style={{ ...input, width: 150 }} value={rateForm.rate}
              onChange={(e) => setRateForm((f) => ({ ...f, rate: e.target.value }))} />
          </label>
          <button type="button" style={primaryBtn}
            disabled={!rateForm.currency_code || !Number(rateForm.rate)}
            onClick={() => run(async () => { await fx.setRate(rateForm); setRateForm((f) => ({ ...f, rate: "" })); }, "Məzənnə yadda saxlanıldı.")}>
            Yadda saxla
          </button>
        </div>

        <table style={table}>
          <thead><tr><th style={th}>TARİX</th><th style={th}>VALYUTA</th><th style={th}>MƏZƏNNƏ</th><th style={th}>MƏNBƏ</th></tr></thead>
          <tbody>
            {fx.rates.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.rate_date}</td>
                <td style={td}>{r.currency_code}</td>
                <td style={td}>{Number(r.rate).toFixed(6)}</td>
                <td style={td}>{r.source}</td>
              </tr>
            ))}
            {!fx.rates.length && <tr><td style={td} colSpan={4}>Məzənnə qeydi yoxdur.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
