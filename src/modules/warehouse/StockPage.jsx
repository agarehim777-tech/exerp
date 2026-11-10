import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import ValuationPanel from "./ValuationPanel.jsx";
import StockAgingPanel from "./StockAgingPanel.jsx";
import ProductSearchSelect from "../../components/ProductSearchSelect.jsx";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { azn, badgeClass, tabClass } from "../../shared/ui/tokens.js";
import { Button, Input, Select, Table } from "../../shared/ui/primitives.tsx";

const MOVE_LABEL = { in: "Mədaxil", out: "Məxaric", adjust: "Düzəliş", transfer: "Transfer" };
const MANUAL_MOVE_LABEL = { in: "Mədaxil", out: "Məxaric", adjust: "Düzəliş" };

function useTablePage(rows) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const current = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [rows]);
  return { rows: rows.slice(current * 50, current * 50 + 50), total: rows.length,
    page: current, pages, setPage };
}

function TablePages({ value, label }) {
  if (value.total <= 50) return null;
  return <nav aria-label={label} className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-margin-top-12px">
    <span>{value.page * 50 + 1}–{Math.min((value.page + 1) * 50, value.total)} / {value.total}</span>
    <div className="u-display-flex u-gap-8px">
      <button type="button" className="stock-page-secondary-action-btn" title="Əvvəlki səhifə" aria-label="Əvvəlki səhifə" disabled={value.page === 0} onClick={() => value.setPage(value.page - 1)}><ChevronLeft size={16} /></button>
      <button type="button" className="stock-page-secondary-action-btn" title="Növbəti səhifə" aria-label="Növbəti səhifə" disabled={value.page === value.pages - 1} onClick={() => value.setPage(value.page + 1)}><ChevronRight size={16} /></button>
    </div>
  </nav>;
}

export default function StockPage({ inventory: stock, products = [] }) {
  const { activeMembership } = useAuth();
  const { isAdmin } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const [tab, setTab] = useState("warehouses");

  const totals = useMemo(() => {
    const qty = stock.balances.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    const value = stock.balances.reduce(
      (sum, b) => sum + Number(b.qty || 0) * Number(b.avg_cost || 0),
      0,
    );
    const low = stock.balances.filter(
      (b) => Number(b.reorder_point) > 0 && Number(b.qty) - Number(b.reserved || 0) - Number(b.problem_qty || 0) <= Number(b.reorder_point),
    ).length;
    return { qty, value, low };
  }, [stock.balances]);

  if (!tenantId) return <div className="stock-page-card">Aktiv şirkət seçilməyib.</div>;

  return (
    <div className="u-display-grid u-gap-16px u-min-width-0">
      <div>
        <h1 className="u-margin-0 u-font-size-26px u-line-height-1_2 u-color-12372c">Anbar idarəetməsi</h1>
        <p className="u-margin-6px_0_0 u-font-size-14px u-color-66756f">
          Anbarları, qalıqları, daxili transferləri və stok hərəkətlərini bir yerdən idarə edin.
        </p>
      </div>
      <div className="u-display-flex u-gap-12px u-flex-wrap-wrap">
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Anbarlar</div>
          <div className="ui-tok-stat-value">{stock.warehouses.length}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Ümumi qalıq</div>
          <div className="ui-tok-stat-value">{totals.qty.toLocaleString("az-AZ")}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Anbar dəyəri (orta maya)</div>
          <div className="ui-tok-stat-value">{azn(totals.value)}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Kritik səviyyə</div>
          <div className={`ui-tok-stat-value ${totals.low ? "sx-9d7a4ce" : "sx-7c2de19"}`}>{totals.low}</div>
        </div>
      </div>

      <div className="ui-tok-tab-bar">
        {[["warehouses", "Anbarlar"], ["balances", "Anbarlar üzrə qalıqlar"], ["transfer", "Daxili transfer"], ["movements", "Hərəkətlər"], ["valuation", "Dəyərləmə"], ["aging", "Stok yaşlandırması"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`${tabClass(tab === k)}`}>{l}</button>
        ))}
      </div>

      {stock.error && <div className="ui-tok-msg-box">Xəta: {stock.error.message}</div>}
      {stock.degraded && (
        <div className="ui-tok-msg-box">Canlı yenilənmə kəsildi — məlumatlar avtomatik yenidən sinxronlaşdırılır…</div>
      )}

      {tab === "balances" && <BalancesPanel stock={stock} />}
      {tab === "transfer" && <TransferPanel stock={stock} />}
      {tab === "movements" && <MovementsPanel stock={stock} products={products} />}
      {tab === "valuation" && <ValuationPanel loadMovements={stock.fetchAllMovements} products={products} balances={stock.balances} />}
      {tab === "aging" && <StockAgingPanel tenantId={tenantId} />}
      {tab === "warehouses" && <WarehousesPanel stock={stock} isAdmin={isAdmin} />}
    </div>
  );
}

function BalancesPanel({ stock }) {
  const [filters, setFilters] = useState({ warehouseId: "", query: "", status: "all" });
  const [editingKey, setEditingKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const filteredBalances = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("az-AZ");
    return stock.balances.filter((balance) => {
      const saleable = Number(balance.qty) - Number(balance.reserved || 0) - Number(balance.problem_qty || 0);
      const low = Number(balance.reorder_point) > 0 && saleable <= Number(balance.reorder_point);
      const matchesWarehouse = !filters.warehouseId || balance.warehouse_id === filters.warehouseId;
      const matchesStatus = filters.status === "all"
        || (filters.status === "low" && low)
        || (filters.status === "normal" && !low);
      const haystack = `${balance.product?.name || ""} ${balance.product?.sku || balance.sku || ""}`.toLocaleLowerCase("az-AZ");
      return matchesWarehouse && matchesStatus && (!query || haystack.includes(query));
    });
  }, [stock.balances, filters]);
  const balancePage = useTablePage(filteredBalances);

  const resetFilters = () => setFilters({ warehouseId: "", query: "", status: "all" });
  const balanceKey = (balance) => balance.id || `${balance.warehouse_id}:${balance.product_id}`;
  const startEditing = (balance) => {
    setEditingKey(balanceKey(balance));
    setEditValue(String(Number(balance.reorder_point || 0)));
    setEditError("");
  };
  const cancelEditing = () => {
    setEditingKey("");
    setEditValue("");
    setEditError("");
  };
  const saveCriticalLevel = async (balance) => {
    const value = Number(editValue);
    if (!Number.isFinite(value) || value < 0) {
      setEditError("Kritik hədd 0 və ya daha böyük olmalıdır.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      await stock.setReorderPoint(balance, value);
      cancelEditing();
    } catch (error) {
      setEditError(`Kritik hədd saxlanılmadı: ${error.message}`);
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="stock-page-card">
      <div className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-flex-wrap-wrap">
        <h3 className="u-margin-0">Anbar qalıqları ({filteredBalances.length}/{stock.balances.length})</h3>
        {(filters.warehouseId || filters.query || filters.status !== "all") && (
          <button type="button" className="stock-page-secondary-action-btn" onClick={resetFilters}>Filtrləri təmizlə</button>
        )}
      </div>
      <div className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_190px_1fr u-gap-10px u-margin-16px_0">
        <Select value={filters.warehouseId} onChange={(event) => setFilters((current) => ({ ...current, warehouseId: event.target.value }))} className="ui-tok-input">
          <option value="">Bütün anbarlar</option>
          {stock.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
        </Select>
        <Input
          type="search"
          placeholder="Məhsul adı və ya SKU axtar…"
          value={filters.query}
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
 className="ui-tok-input"
 />
        <Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="ui-tok-input">
          <option value="all">Bütün statuslar</option>
          <option value="low">Sifariş tələb edən</option>
          <option value="normal">Normal qalıq</option>
        </Select>
      </div>
      {editError && <div className="ui-tok-msg-box sx-fa3e1c7">{editError}</div>}
      {stock.loading && <div>Yüklənir…</div>}
      <div className="u-overflow-x-auto">
      <Table className="ui-tok-table">
        <thead>
          <tr>
            <th className="ui-tok-th">Anbar</th><th className="ui-tok-th">Məhsul</th><th className="ui-tok-th">SKU</th>
            <th className="ui-tok-th">Fiziki qalıq</th><th className="ui-tok-th">Rezerv</th><th className="ui-tok-th">Problemli</th><th className="ui-tok-th">Satışa uyğun</th><th className="ui-tok-th">Kritik həd</th><th className="ui-tok-th">Status</th>
          </tr>
        </thead>
        <tbody>
          {balancePage.rows.map((b) => {
            const saleable = Number(b.qty) - Number(b.reserved || 0) - Number(b.problem_qty || 0);
            const low = Number(b.reorder_point) > 0 && saleable <= Number(b.reorder_point);
            const key = balanceKey(b);
            const isEditing = editingKey === key;
            return (
              <tr key={key}>
                <td className="ui-tok-td">{b.warehouse?.name || "—"}</td>
                <td className="ui-tok-td">{b.product?.name || b.sku || "—"}</td>
                <td className="ui-tok-td">{b.product?.sku || b.sku || "—"}</td>
                <td className="ui-tok-td sx-e634e6d">{Number(b.qty || 0).toLocaleString("az-AZ")}</td>
                <td className="ui-tok-td">{Number(b.reserved || 0).toLocaleString("az-AZ")}</td>
                <td className={`ui-tok-td ${Number(b.problem_qty || 0) > 0 ? "sx-9d7a4ce" : ""} sx-4777d93`}>{Number(b.problem_qty || 0).toLocaleString("az-AZ")}</td>
                <td className="ui-tok-td sx-4777d93">{saleable.toLocaleString("az-AZ")}</td>
                <td className="ui-tok-td">
                  {isEditing ? (
                    <div className="u-display-flex u-align-items-center u-gap-6px">
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        autoFocus
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveCriticalLevel(b);
                          if (event.key === "Escape") cancelEditing();
                        }}
                        className="ui-tok-input sx-17ac2e7"
 />
                      <Button variant="ghost" type="button" disabled={editBusy} onClick={() => saveCriticalLevel(b)} className="stock-page-secondary-action-btn sx-296600a" aria-label="Kritik həddi yadda saxla"><Check size={16} /></Button>
                      <Button variant="ghost" type="button" disabled={editBusy} onClick={cancelEditing} className="stock-page-secondary-action-btn sx-296600a" aria-label="Redaktəni ləğv et"><X size={16} /></Button>
                    </div>
                  ) : (
                    <div className="u-display-flex u-align-items-center u-gap-8px">
                      <span className="u-min-width-28px u-font-weight-650">{Number(b.reorder_point || 0).toLocaleString("az-AZ")}</span>
                      <Button variant="ghost" type="button" onClick={() => startEditing(b)} className="stock-page-secondary-action-btn sx-296600a" aria-label="Kritik həddi redaktə et"><Pencil size={15} /></Button>
                    </div>
                  )}
                </td>
                <td className="ui-tok-td">
                  <span className={`${badgeClass(low ? "red" : "green")}`}>{low ? "Sifariş et" : "Normal"}</span>
                </td>
              </tr>
            );
          })}
          {!stock.balances.length && !stock.loading && (
            <tr><td className="ui-tok-td" colSpan={9}>Qalıq yoxdur — «Hərəkətlər» bölməsindən mədaxil edin.</td></tr>
          )}
          {!!stock.balances.length && !filteredBalances.length && !stock.loading && (
            <tr><td className="ui-tok-td" colSpan={9}>Seçilmiş filtrlərə uyğun qalıq tapılmadı.</td></tr>
          )}
        </tbody>
      </Table>
      </div>
      <TablePages value={balancePage} label="Qalıq səhifələri" />
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
    <div className="stock-page-card">
      <h3 className="u-margin-top-0">
        Anbar hərəkətləri ({stock.movementsTotal.toLocaleString("az-AZ")})
      </h3>
      {msg && <div className="ui-tok-msg-box">{msg}</div>}
      <form onSubmit={submit} className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_130px_1fr u-gap-8px u-margin-bottom-16px">
        <Select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className="ui-tok-input">
          <option value="">Anbar seç…</option>
          {stock.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <ProductSearchSelect products={products} value={form.product_id} onChange={(productId) => setForm({ ...form, product_id: productId })} />
        <Select value={form.move_type} onChange={(e) => setForm({ ...form, move_type: e.target.value })} className="ui-tok-input">
          {Object.entries(MANUAL_MOVE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Input required type="number" step="0.001" placeholder="Say" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="ui-tok-input" />
        <Input type="number" step="0.01" placeholder="Maya dəyəri" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="ui-tok-input" />
        <Input placeholder="Sənəd №" value={form.doc_no} onChange={(e) => setForm({ ...form, doc_no: e.target.value })} className="ui-tok-input" />
        <button type="submit" disabled={busy || !stock.warehouses.length} className="ui-tok-primary-btn">+ Qeyd et</button>
      </form>
      {!stock.warehouses.length && <div className="ui-tok-msg-box">Əvvəlcə «Anbarlar» bölməsindən anbar yaradın.</div>}
      <Table className="ui-tok-table">
        <thead>
          <tr>
            <th className="ui-tok-th">Tarix</th><th className="ui-tok-th">Anbar</th><th className="ui-tok-th">Məhsul</th>
            <th className="ui-tok-th">Növ</th><th className="ui-tok-th">Say</th><th className="ui-tok-th">Sənəd</th>
          </tr>
        </thead>
        <tbody>
          {stock.movements.map((m) => (
            <tr key={m.id}>
              <td className="ui-tok-td">{new Date(m.moved_at).toLocaleDateString("az-AZ")}</td>
              <td className="ui-tok-td">{m.warehouse?.name || "—"}</td>
              <td className="ui-tok-td">{m.product?.name || m.sku || "—"}</td>
              <td className="ui-tok-td"><span className={`${badgeClass(m.move_type === "out" ? "red" : "green")}`}>{MOVE_LABEL[m.move_type]}</span></td>
              <td className="ui-tok-td">{Number(m.qty).toLocaleString("az-AZ")}</td>
              <td className="ui-tok-td">{m.doc_no || "—"}</td>
            </tr>
          ))}
          {!stock.movements.length && (
            <tr><td className="ui-tok-td" colSpan={6}>{stock.movementsLoading ? "Yüklənir…" : "Hərəkət yoxdur."}</td></tr>
          )}
        </tbody>
      </Table>
      <div className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-margin-top-12px u-flex-wrap-wrap">
        <div className="u-font-size-13px u-opacity-0_75">
          Səhifə {stock.movementsPage + 1} / {stock.movementsPageCount} · səhifədə {stock.movementsPageSize} qeyd
        </div>
        <div className="u-display-flex u-gap-8px">
          <button
            type="button"
 className="ui-tok-primary-btn"
            disabled={stock.movementsPage === 0 || stock.movementsLoading}
            onClick={() => stock.setMovementsPage((page) => Math.max(0, page - 1))}
 >
            ← Əvvəlki
          </button>
          <button
            type="button"
 className="ui-tok-primary-btn"
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
    <div className="stock-page-card">
      <h2 className="stock-page-section-title">Daxili anbar transferi</h2>
      <p className="stock-page-section-subtitle">Məhsulu bir anbardan digərinə köçürün. Çıxış və giriş birlikdə qeydə alınır.</p>
      {msg && <div className="ui-tok-msg-box">{msg}</div>}
      <form onSubmit={submit} className="stock-page-form-grid">
        <label className="stock-page-field-label">Mənbə anbar<Select required value={form.fromWarehouseId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value, productId: "" })} className="ui-tok-input"><option value="">Seçin…</option>{stock.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select></label>
        <label className="stock-page-field-label">Hədəf anbar<Select required value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })} className="ui-tok-input"><option value="">Seçin…</option>{stock.warehouses.filter((w) => w.id !== form.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</Select></label>
        <label className="stock-page-field-label">Məhsul<ProductSearchSelect disabled={!form.fromWarehouseId} products={sourceBalances.map((row) => ({ id: row.product_id, name: row.product?.name || row.sku, sku: row.sku, qty: row.qty }))} value={form.productId} onChange={(productId) => setForm({ ...form, productId })} renderMeta={(product) => `${Number(product.qty).toLocaleString("az-AZ")} ədəd`} /></label>
        <label className="stock-page-field-label">Miqdar<Input required type="number" min="0.001" step="0.001" max={selectedBalance?.qty || undefined} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="ui-tok-input" /></label>
        <label className="stock-page-field-label sx-b452654">Qeyd<Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Transfer səbəbi" className="ui-tok-input" /></label>
        <div className="u-grid-column-1_1 u-display-flex u-justify-content-flex_end"><button type="submit" disabled={busy || stock.warehouses.length < 2} className="ui-tok-primary-btn">{busy ? "Köçürülür…" : "Transfer et"}</button></div>
      </form>
      {stock.warehouses.length < 2 && <div className="ui-tok-msg-box sx-002535c">Transfer üçün ən azı iki anbar yaradılmalıdır.</div>}
    </div>
  );
}

function WarehousesPanel({ stock, isAdmin }) {
  const emptyForm = { id: "", code: "", name: "", address: "", is_active: true };
  const [form, setForm] = useState(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const filteredWarehouses = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("az-AZ");
    return stock.warehouses.filter(row => !search || `${row.code} ${row.name} ${row.address || ""}`.toLocaleLowerCase("az-AZ").includes(search));
  }, [stock.warehouses, query]);
  const warehousePage = useTablePage(filteredWarehouses);

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      if (form.id) await stock.updateWarehouse(form.id, form);
      else await stock.createWarehouse({ code: form.code, name: form.name, address: form.address, is_active: true });
      setMsg(form.id ? "Anbar məlumatları yeniləndi." : "Yeni anbar yaradıldı.");
      setForm(emptyForm);
      setIsFormOpen(false);
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
  };

  const edit = (warehouse) => {
    setForm({
      id: warehouse.id,
      code: warehouse.code || "",
      name: warehouse.name || "",
      address: warehouse.address || "",
      is_active: warehouse.is_active !== false,
    });
    setIsFormOpen(true);
  };

  const toggleForm = () => {
    if (isFormOpen) setForm(emptyForm);
    setIsFormOpen((open) => !open);
  };

  const remove = async (warehouse) => {
    if (!(await appConfirm(`“${warehouse.name}” anbarı silinsin?`, { danger: true }))) return;
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
    <div className="stock-page-card">
      <div className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-flex-wrap-wrap">
        <h2 className="stock-page-section-title">Anbarlar ({stock.warehouses.length})</h2>
        {isAdmin && (
          <button type="button" className={`${isFormOpen ? "stock-page-secondary-action-btn" : "ui-tok-primary-btn"}`} onClick={toggleForm}>
            {isFormOpen ? "Formanı bağla ↑" : "+ Yeni anbar"}
          </button>
        )}
      </div>
      <p className="stock-page-section-subtitle">Anbar yaratmaq, redaktə etmək və silmək üçün vahid idarəetmə ekranı.</p>
      <Input type="search" aria-label="Anbar axtarışı" placeholder="Anbar axtar..." value={query} onChange={event => setQuery(event.target.value)} className="ui-tok-input sx-6179637" />
      {msg && <div className="ui-tok-msg-box">{msg}</div>}
      {isAdmin && isFormOpen && (
        <form onSubmit={submit} className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_min_100_140px_1fr u-gap-10px u-margin-bottom-18px u-align-items-end">
          <Input required placeholder="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="ui-tok-input" />
          <Input required placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ui-tok-input" />
          <Input placeholder="Ünvan" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="ui-tok-input" />
          <button type="submit" className="ui-tok-primary-btn">{form.id ? "Yadda saxla" : "+ Anbar"}</button>
          {form.id && <button type="button" className="stock-page-secondary-action-btn" onClick={() => { setForm(emptyForm); setIsFormOpen(false); }}>Ləğv et</button>}
        </form>
      )}
      <div className="u-overflow-x-auto">
      <Table className="ui-tok-table">
        <thead><tr><th className="ui-tok-th">Kod</th><th className="ui-tok-th">Ad</th><th className="ui-tok-th">Ünvan</th>{isAdmin && <th className="ui-tok-th" />}</tr></thead>
        <tbody>
          {warehousePage.rows.map((w) => (
            <tr key={w.id}>
              <td className="ui-tok-td"><b>{w.code}</b></td>
              <td className="ui-tok-td">{w.name}</td>
              <td className="ui-tok-td">{w.address || "—"}</td>
              {isAdmin && <td className="ui-tok-td sx-4ddbe90"><button className="stock-page-secondary-action-btn" onClick={() => edit(w)}>Redaktə et</button><button className="ui-tok-del-btn" onClick={() => remove(w)}>Sil</button></td>}
            </tr>
          ))}
          {!filteredWarehouses.length && <tr><td className="ui-tok-td" colSpan={4}>Anbar yoxdur.</td></tr>}
        </tbody>
      </Table>
      </div>
      <TablePages value={warehousePage} label="Anbar səhifələri" />
    </div>
  );
}
