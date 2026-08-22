import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { useStock } from "../../shared/hooks/useStock.js";
import { useProducts } from "../../shared/hooks/useProducts.js";
import ValuationPanel from "./ValuationPanel.jsx";
import StockAgingPanel from "./StockAgingPanel.jsx";
import ProductSearchSelect from "../../components/ProductSearchSelect.jsx";
import {
  azn, badge, card, delBtn, input, msgBox, primaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const MOVE_LABEL = { in: "Mədaxil", out: "Məxaric", adjust: "Düzəliş", transfer: "Transfer" };
const MANUAL_MOVE_LABEL = { in: "Mədaxil", out: "Məxaric", adjust: "Düzəliş" };
const sectionTitle = { margin: 0, fontSize: 19, lineHeight: 1.3, color: "#12372c" };
const sectionSubtitle = { margin: "5px 0 18px", fontSize: 13, lineHeight: 1.5, color: "#66756f" };
const fieldLabel = { display: "grid", gap: 6, fontSize: 13, fontWeight: 650, color: "#334b43" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14 };
const secondaryActionBtn = { background: "#f6f3e8", color: "#385248", border: "1px solid #d8d1b9", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 };

export default function StockPage() {
  const { activeMembership } = useAuth();
  const { isAdmin } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const stock = useStock(tenantId);
  const { products } = useProducts(tenantId);
  const [tab, setTab] = useState("warehouses");

  const totals = useMemo(() => {
    const qty = stock.balances.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    const value = stock.balances.reduce(
      (sum, b) => sum + Number(b.qty || 0) * Number(b.avg_cost || 0),
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
      <div>
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, color: "#12372c" }}>Anbar idarəetməsi</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#66756f" }}>
          Anbarları, qalıqları, daxili transferləri və stok hərəkətlərini bir yerdən idarə edin.
        </p>
      </div>
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
        {[["warehouses", "Anbarlar"], ["balances", "Anbarlar üzrə qalıqlar"], ["transfer", "Daxili transfer"], ["movements", "Hərəkətlər"], ["valuation", "Dəyərləmə"], ["aging", "Stok yaşlandırması"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}</button>
        ))}
      </div>

      {stock.error && <div style={msgBox}>Xəta: {stock.error.message}</div>}
      {stock.degraded && (
        <div style={msgBox}>Canlı yenilənmə kəsildi — məlumatlar avtomatik yenidən sinxronlaşdırılır…</div>
      )}

      {tab === "balances" && <BalancesPanel stock={stock} />}
      {tab === "transfer" && <TransferPanel stock={stock} />}
      {tab === "movements" && <MovementsPanel stock={stock} products={products} />}
      {tab === "valuation" && <ValuationPanel loadMovements={stock.fetchAllMovements} products={products} />}
      {tab === "aging" && <StockAgingPanel tenantId={tenantId} />}
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
                <td style={{ ...td, fontWeight: 600 }}>{Number(b.qty || 0).toLocaleString("az-AZ")}</td>
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
      <h3 style={{ marginTop: 0 }}>
        Anbar hərəkətləri ({stock.movementsTotal.toLocaleString("az-AZ")})
      </h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
        <select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} style={input}>
          <option value="">Anbar seç…</option>
          {stock.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <ProductSearchSelect products={products} value={form.product_id} onChange={(productId) => setForm({ ...form, product_id: productId })} />
        <select value={form.move_type} onChange={(e) => setForm({ ...form, move_type: e.target.value })} style={input}>
          {Object.entries(MANUAL_MOVE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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
          {!stock.movements.length && (
            <tr><td style={td} colSpan={6}>{stock.movementsLoading ? "Yüklənir…" : "Hərəkət yoxdur."}</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Səhifə {stock.movementsPage + 1} / {stock.movementsPageCount} · səhifədə {stock.movementsPageSize} qeyd
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={primaryBtn}
            disabled={stock.movementsPage === 0 || stock.movementsLoading}
            onClick={() => stock.setMovementsPage((page) => Math.max(0, page - 1))}
          >
            ← Əvvəlki
          </button>
          <button
            type="button"
            style={primaryBtn}
            disabled={stock.movementsPage + 1 >= stock.movementsPageCount || stock.movementsLoading}
            onClick={() => stock.setMovementsPage((page) => page + 1)}
          >
            Növbəti →
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferPanel({ stock }) {
  const [form, setForm] = useState({ fromWarehouseId: "", toWarehouseId: "", productId: "", qty: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const sourceBalances = stock.balances.filter((row) => row.warehouse_id === form.fromWarehouseId && Number(row.qty || 0) > 0);
  const selectedBalance = sourceBalances.find((row) => row.product_id === form.productId);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMsg("");
    try {
      const reference = await stock.transferStock(form);
      setForm((current) => ({ ...current, productId: "", qty: "", note: "" }));
      setMsg(`Transfer tamamlandı: ${reference}`);
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
    finally { setBusy(false); }
  };

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Daxili anbar transferi</h2>
      <p style={sectionSubtitle}>Məhsulu bir anbardan digərinə köçürün. Çıxış və giriş birlikdə qeydə alınır.</p>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={formGrid}>
        <label style={fieldLabel}>Mənbə anbar<select required value={form.fromWarehouseId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value, productId: "" })} style={input}><option value="">Seçin…</option>{stock.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
        <label style={fieldLabel}>Hədəf anbar<select required value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })} style={input}><option value="">Seçin…</option>{stock.warehouses.filter((w) => w.id !== form.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
        <label style={fieldLabel}>Məhsul<ProductSearchSelect disabled={!form.fromWarehouseId} products={sourceBalances.map((row) => ({ id: row.product_id, name: row.product?.name || row.sku, sku: row.sku, qty: row.qty }))} value={form.productId} onChange={(productId) => setForm({ ...form, productId })} renderMeta={(product) => `${Number(product.qty).toLocaleString("az-AZ")} ədəd`} /></label>
        <label style={fieldLabel}>Miqdar<input required type="number" min="0.001" step="0.001" max={selectedBalance?.qty || undefined} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={input} /></label>
        <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>Qeyd<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Transfer səbəbi" style={input} /></label>
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}><button type="submit" disabled={busy || stock.warehouses.length < 2} style={primaryBtn}>{busy ? "Köçürülür…" : "Transfer et"}</button></div>
      </form>
      {stock.warehouses.length < 2 && <div style={{ ...msgBox, marginTop: 12 }}>Transfer üçün ən azı iki anbar yaradılmalıdır.</div>}
    </div>
  );
}

function WarehousesPanel({ stock, isAdmin }) {
  const emptyForm = { id: "", code: "", name: "", address: "", is_active: true };
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      if (form.id) await stock.updateWarehouse(form.id, form);
      else await stock.createWarehouse({ code: form.code, name: form.name, address: form.address, is_active: true });
      setMsg(form.id ? "Anbar məlumatları yeniləndi." : "Yeni anbar yaradıldı.");
      setForm(emptyForm);
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
  };

  const edit = (warehouse) => setForm({
    id: warehouse.id,
    code: warehouse.code || "",
    name: warehouse.name || "",
    address: warehouse.address || "",
    is_active: warehouse.is_active !== false,
  });

  const remove = async (warehouse) => {
    if (!window.confirm(`“${warehouse.name}” anbarı silinsin?`)) return;
    setMsg("");
    try {
      await stock.removeWarehouse(warehouse.id);
      if (form.id === warehouse.id) setForm(emptyForm);
      setMsg("Anbar silindi.");
    } catch (error) {
      setMsg(`Anbar silinmədi: ${error.message}`);
    }
  };

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Anbarlar ({stock.warehouses.length})</h2>
      <p style={sectionSubtitle}>Anbar yaratmaq, redaktə etmək və silmək üçün vahid idarəetmə ekranı.</p>
      {msg && <div style={msgBox}>{msg}</div>}
      {isAdmin && (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "130px 1fr 1.4fr auto auto", gap: 10, marginBottom: 18, alignItems: "end" }}>
          <input required placeholder="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={input} />
          <input required placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
          <input placeholder="Ünvan" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={input} />
          <button type="submit" style={primaryBtn}>{form.id ? "Yadda saxla" : "+ Anbar"}</button>
          {form.id && <button type="button" style={secondaryActionBtn} onClick={() => setForm(emptyForm)}>Ləğv et</button>}
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
              {isAdmin && <td style={{ ...td, whiteSpace: "nowrap" }}><button style={secondaryActionBtn} onClick={() => edit(w)}>Redaktə et</button><button style={delBtn} onClick={() => remove(w)}>Sil</button></td>}
            </tr>
          ))}
          {!stock.warehouses.length && <tr><td style={td} colSpan={4}>Anbar yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
