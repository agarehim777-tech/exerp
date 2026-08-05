import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { useStock } from "../../shared/hooks/useStock.js";
import { useProducts } from "../../shared/hooks/useProducts.js";
import {
  azn, badge, card, delBtn, input, msgBox, primaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const MOVE_LABEL = { in: "Mədaxil", out: "Məxaric", adjust: "Düzəliş", transfer: "Transfer" };

export default function StockPage() {
  const { activeMembership } = useAuth();
  const { isAdmin } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const stock = useStock(tenantId);
  const { products } = useProducts(tenantId);
  const [tab, setTab] = useState("balances");

  const totals = useMemo(() => {
    const qty = stock.balances.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    const value = stock.balances.reduce(
      (sum, b) => sum + Number(b.qty || 0) * Number(b.product?.price || b.avg_cost || 0),
      0,
    );
    const low = stock.balances.filter(
      (b) => Number(b.reorder_point) > 0 && Number(b.qty) <= Number(b.reorder_point),
    ).length;
    return { qty, value, low };
  }, [stock.balances]);

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}>
          <div style={statLabel}>Anbarlar</div>
          <div style={statValue}>{stock.warehouses.length}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Ümumi qalıq</div>
          <div style={statValue}>{totals.qty.toLocaleString("az-AZ")}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Anbar dəyəri</div>
          <div style={statValue}>{azn(totals.value)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Kritik səviyyə</div>
          <div style={{ ...statValue, color: totals.low ? "#b23a3a" : "#064e3b" }}>{totals.low}</div>
        </div>
      </div>

      <div style={tabBar}>
        {[["balances", "Qalıqlar"], ["movements", "Hərəkətlər"], ["valuation", "Dəyərləmə"], ["warehouses", "Anbarlar"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}</button>
        ))}
      </div>

      {stock.error && <div style={msgBox}>Xəta: {stock.error.message}</div>}

      {tab === "balances" && <BalancesPanel stock={stock} />}
      {tab === "movements" && <MovementsPanel stock={stock} products={products} />}
      {tab === "valuation" && <ValuationPanel movements={stock.movements} products={products} />}
      {tab === "warehouses" && <WarehousesPanel stock={stock} isAdmin={isAdmin} />}
    </div>
  );
}

function BalancesPanel({ stock }) {
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Anbar qalıqları ({stock.balances.length})</h3>
      {stock.loading && <div>Yüklənir…</div>}
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Anbar</th><th style={th}>Məhsul</th><th style={th}>SKU</th>
            <th style={th}>Qalıq</th><th style={th}>Kritik həd</th><th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {stock.balances.map((b) => {
            const low = Number(b.reorder_point) > 0 && Number(b.qty) <= Number(b.reorder_point);
            return (
              <tr key={b.id}>
                <td style={td}>{b.warehouse?.name || "—"}</td>
                <td style={td}>{b.product?.name || b.sku || "—"}</td>
                <td style={td}>{b.product?.sku || b.sku || "—"}</td>
                <td style={{ ...td, fontWeight: 600 }}>{Number(b.qty).toLocaleString("az-AZ")}</td>
                <td style={td}>
                  <input
                    type="number"
                    defaultValue={b.reorder_point}
                    onBlur={(e) => stock.setReorderPoint(b.id, e.target.value)}
                    style={{ ...input, width: 90 }}
                  />
                </td>
                <td style={td}>
                  <span style={badge(low ? "red" : "green")}>{low ? "Sifariş et" : "Normal"}</span>
                </td>
              </tr>
            );
          })}
          {!stock.balances.length && !stock.loading && (
            <tr><td style={td} colSpan={6}>Qalıq yoxdur — «Hərəkətlər» bölməsindən mədaxil edin.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MovementsPanel({ stock, products }) {
  const [form, setForm] = useState({
    warehouse_id: "", product_id: "", move_type: "in", qty: "", unit_cost: "", doc_no: "", note: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMsg("");
    try {
      const product = products.find((p) => p.id === form.product_id);
      await stock.addMovement({ ...form, product_id: form.product_id || null, sku: product?.sku || null });
      setForm({ ...form, qty: "", unit_cost: "", doc_no: "", note: "" });
      setMsg("Hərəkət qeyd edildi, qalıq yeniləndi.");
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
    setBusy(false);
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Anbar hərəkətləri</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
        <select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} style={input}>
          <option value="">Anbar seç…</option>
          {stock.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} style={input}>
          <option value="">Məhsul seç…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={form.move_type} onChange={(e) => setForm({ ...form, move_type: e.target.value })} style={input}>
          {Object.entries(MOVE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input required type="number" step="0.001" placeholder="Say" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={input} />
        <input type="number" step="0.01" placeholder="Maya dəyəri" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} style={input} />
        <input placeholder="Sənəd №" value={form.doc_no} onChange={(e) => setForm({ ...form, doc_no: e.target.value })} style={input} />
        <button type="submit" disabled={busy || !stock.warehouses.length} style={primaryBtn}>+ Qeyd et</button>
      </form>
      {!stock.warehouses.length && <div style={msgBox}>Əvvəlcə «Anbarlar» bölməsindən anbar yaradın.</div>}
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Tarix</th><th style={th}>Anbar</th><th style={th}>Məhsul</th>
            <th style={th}>Növ</th><th style={th}>Say</th><th style={th}>Sənəd</th>
          </tr>
        </thead>
        <tbody>
          {stock.movements.map((m) => (
            <tr key={m.id}>
              <td style={td}>{new Date(m.moved_at).toLocaleDateString("az-AZ")}</td>
              <td style={td}>{m.warehouse?.name || "—"}</td>
              <td style={td}>{m.product?.name || m.sku || "—"}</td>
              <td style={td}><span style={badge(m.move_type === "out" ? "red" : "green")}>{MOVE_LABEL[m.move_type]}</span></td>
              <td style={td}>{Number(m.qty).toLocaleString("az-AZ")}</td>
              <td style={td}>{m.doc_no || "—"}</td>
            </tr>
          ))}
          {!stock.movements.length && <tr><td style={td} colSpan={6}>Hərəkət yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function WarehousesPanel({ stock, isAdmin }) {
  const [form, setForm] = useState({ code: "", name: "", address: "" });
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await stock.createWarehouse(form);
      setForm({ code: "", name: "", address: "" });
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Anbarlar ({stock.warehouses.length})</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      {isAdmin && (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
          <input required placeholder="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={input} />
          <input required placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
          <input placeholder="Ünvan" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={input} />
          <button type="submit" style={primaryBtn}>+ Anbar</button>
        </form>
      )}
      <table style={table}>
        <thead><tr><th style={th}>Kod</th><th style={th}>Ad</th><th style={th}>Ünvan</th>{isAdmin && <th style={th} />}</tr></thead>
        <tbody>
          {stock.warehouses.map((w) => (
            <tr key={w.id}>
              <td style={td}><b>{w.code}</b></td>
              <td style={td}>{w.name}</td>
              <td style={td}>{w.address || "—"}</td>
              {isAdmin && (
                <td style={td}>
                  <button style={delBtn} onClick={() => window.confirm("Anbar silinsin?") && stock.removeWarehouse(w.id)}>Sil</button>
                </td>
              )}
            </tr>
          ))}
          {!stock.warehouses.length && <tr><td style={td} colSpan={4}>Anbar yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
