import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useProducts } from "../../shared/hooks/useProducts.js";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { azn, badgeClass } from "../../shared/ui/tokens.js";
import LoadMoreBar from "../../components/LoadMoreBar.jsx";
import { appConfirm } from "../../shared/ui/dialogService.js";

const emptyProduct = { id: "", sku: "", name: "", description: "", unit: "ədəd", price: "", currency: "AZN", vat_rate: 18, is_active: true };

export default function ProductsPage({ legacyProducts = [], inventoryRows = [] }) {
  const { activeTenantId } = useAuth();
  const { isAdmin } = usePermissions();
  const { products: dbProducts, loading, error, create, update, remove, hasMore, loadMore } = useProducts(activeTenantId);
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [form, setForm] = useState(emptyProduct);
  const [msg, setMsg] = useState("");
  const products = useMemo(() => {
    const byKey = new Map();
    const inventoryByKey = new Map();
    inventoryRows.forEach((row) => {
      const name = row.name || row.product || "";
      const key = String(row.sku || name).trim().toLocaleLowerCase("az-AZ");
      if (!key) return;
      const current = inventoryByKey.get(key) || { total: 0, reserved: 0, problemQty: 0, reorderLevel: 0 };
      current.total += Number(row.total ?? row.qty ?? row.on_hand ?? 0);
      current.reserved += Number(row.reserved || 0);
      current.problemQty += Number(row.problemQty ?? row.problem_qty ?? row.problem ?? 0);
      current.reorderLevel = Math.max(current.reorderLevel, Number(row.reorderLevel ?? row.reorder_point ?? row.minimum_level ?? 0));
      inventoryByKey.set(key, current);
    });
    const add = (product, source) => {
      const name = product.name || product.product || "";
      const sku = product.sku || "";
      if (!name && !sku) return;
      const key = String(sku || name).trim().toLocaleLowerCase("az-AZ");
      if (byKey.has(key) && source !== "db") return;
      byKey.set(key, {
        ...emptyProduct,
        ...product,
        id: product.id || `${source}-${key}`,
        name,
        sku: sku || `STOK-${String(name).replace(/\s+/g, "-").toUpperCase()}`,
        price: Number(product.price ?? product.salePrice ?? 0),
        vat_rate: Number(product.vat_rate ?? product.vatRate ?? 18),
        unit: product.unit || "ədəd",
        is_active: product.is_active ?? product.status !== "Passiv",
        _catalogSource: source,
      });
    };
    legacyProducts.forEach((product) => add(product, product._source === "db" ? "db" : "legacy"));
    inventoryRows.forEach((product) => add(product, "inventory"));
    dbProducts.forEach((product) => add(product, "db"));
    return [...byKey.entries()].map(([key, product]) => {
      const inventory = inventoryByKey.get(key) || { total: 0, reserved: 0, problemQty: 0, reorderLevel: 0 };
      return {
        ...product,
        totalStock: inventory.total,
        reservedStock: inventory.reserved,
        problemStock: Number(inventory.problemQty || inventory.problem_qty || 0),
        availableStock: inventory.total - inventory.reserved - Number(inventory.problemQty || inventory.problem_qty || 0),
        reorderLevel: inventory.reorderLevel,
      };
    });
  }, [dbProducts, legacyProducts, inventoryRows]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("az-AZ");
    return products.filter((product) => {
      const matchesQuery = !term || [product.sku, product.name, product.description].some((value) => String(value || "").toLocaleLowerCase("az-AZ").includes(term));
      if (!matchesQuery) return false;
      if (stockFilter === "available") return product.availableStock > 0;
      if (stockFilter === "reserved") return product.reservedStock > 0;
      if (stockFilter === "low") return product.availableStock > 0 && product.availableStock <= Math.max(1, product.reorderLevel);
      if (stockFilter === "out") return product.availableStock <= 0;
      return true;
    });
  }, [products, query, stockFilter]);

  const stockSummary = useMemo(() => products.reduce((summary, product) => ({
    total: summary.total + product.totalStock,
    reserved: summary.reserved + product.reservedStock,
    available: summary.available + product.availableStock,
  }), { total: 0, reserved: 0, available: 0 }), [products]);

  const submit = async (event) => {
    event.preventDefault(); setMsg("");
    const payload = { sku: form.sku.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() || null, unit: form.unit || "ədəd", price: Number(form.price || 0), currency: form.currency || "AZN", vat_rate: Number(form.vat_rate || 0), is_active: form.is_active };
    try {
      if (form.id && form._catalogSource === "db") await update(form.id, payload); else await create(payload);
      setMsg(form.id ? "Məhsul yeniləndi." : "Yeni məhsul yaradıldı.");
      setForm(emptyProduct);
    } catch (nextError) { setMsg(`Xəta: ${nextError.message}`); }
  };

  const edit = (product) => setForm({ ...emptyProduct, ...product, price: product.price ?? "", vat_rate: product.vat_rate ?? 18 });
  const deleteProduct = async (product) => {
    if (!(await appConfirm(`“${product.name}” məhsulu silinsin?`, { danger: true }))) return;
    if (product._catalogSource !== "db") { setMsg("Bu köhnə məhsul stok məlumatından gəlir. Əvvəl redaktə edib canlı kataloqa köçürün."); return; }
    try { await remove(product.id); setMsg("Məhsul silindi."); }
    catch (nextError) { setMsg(`Məhsul silinmədi: ${nextError.message}`); }
  };

  return <div className="u-display-grid u-gap-16px">
    <div><h1 className="u-margin-0 u-font-size-26px u-color-12372c">Məhsullar</h1><p className="u-margin-6px_0_0 u-font-size-14px u-color-66756f">Məhsul kataloqu, SKU, satış qiyməti və ƏDV məlumatları.</p></div>
    <div className="u-display-grid u-grid-template-columns-repeat_3_minmax_160px_1fr u-gap-12px">
      <div className="products-page-summary-card"><span className="products-page-summary-label">Ümumi qalıq</span><strong className="products-page-summary-value">{stockSummary.total.toLocaleString("az-AZ")}</strong></div>
      <div className="products-page-summary-card"><span className="products-page-summary-label">Rezerv olunmuş</span><strong className="products-page-summary-value sx-80b150b">{stockSummary.reserved.toLocaleString("az-AZ")}</strong></div>
      <div className="products-page-summary-card"><span className="products-page-summary-label">Satışa uyğun</span><strong className="products-page-summary-value sx-528f6ad">{stockSummary.available.toLocaleString("az-AZ")}</strong></div>
    </div>
    {msg && <div className="ui-tok-msg-box">{msg}</div>}{error && <div className="ui-tok-msg-box">Xəta: {error.message}</div>}
    {isAdmin && <form onSubmit={submit} className="ui-tok-card sx-998b746 sx-b9153b9 sx-114b3e2 sx-ede8748">
      <input required placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="ui-tok-input" />
      <input required placeholder="Məhsulun adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ui-tok-input" />
      <input placeholder="Təsvir" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="ui-tok-input" />
      <input placeholder="Vahid" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="ui-tok-input" />
      <input required type="number" min="0" step="0.01" placeholder="Qiymət" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="ui-tok-input" />
      <button type="submit" className="ui-tok-primary-btn">{form.id ? "Yadda saxla" : "+ Məhsul"}</button>
      {form.id && <button type="button" className="ui-tok-secondary-btn" onClick={() => setForm(emptyProduct)}>Ləğv et</button>}
    </form>}
    <div className="ui-tok-card"><div className="u-display-flex u-justify-content-space_between u-align-items-center u-gap-12px u-margin-bottom-14px u-flex-wrap-wrap"><h2 className="u-margin-0 u-font-size-19px u-color-12372c">Məhsullar ({filtered.length})</h2><div className="u-display-flex u-gap-8px u-flex-wrap-wrap"><input placeholder="SKU, ad və ya təsvir üzrə axtar…" value={query} onChange={(e) => setQuery(e.target.value)} className="ui-tok-input sx-291674d" /><select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="ui-tok-input"><option value="all">Bütün məhsullar</option><option value="available">Satışa uyğun</option><option value="reserved">Rezervdə olanlar</option><option value="low">Aşağı stok</option><option value="out">Stokda yoxdur</option></select></div></div>
      <table className="ui-tok-table"><thead><tr><th className="ui-tok-th">SKU</th><th className="ui-tok-th">Məhsul</th><th className="ui-tok-th">Qalıq</th><th className="ui-tok-th">Rezerv olunmuş</th><th className="ui-tok-th">Satışa uyğun</th><th className="ui-tok-th">Qiymət</th><th className="ui-tok-th">Status</th>{isAdmin && <th className="ui-tok-th">Əməliyyat</th>}</tr></thead><tbody>
        {filtered.map((product) => <tr key={`${product._catalogSource}-${product.id}`}><td className="ui-tok-td"><b>{product.sku}</b></td><td className="ui-tok-td">{product.name}<div className="u-font-size-12px u-color-7a8782">{product.description || (product._catalogSource === "db" ? "—" : "Əvvəlki anbar məlumatından bərpa edilib")}</div></td><td className="ui-tok-td sx-83e4487">{product.totalStock.toLocaleString("az-AZ")}</td><td className={`ui-tok-td ${product.reservedStock > 0 ? "sx-80b150b" : "sx-51a53ff"} sx-4777d93`}>{product.reservedStock.toLocaleString("az-AZ")}</td><td className={`ui-tok-td ${product.availableStock > 0 ? "sx-528f6ad" : "sx-a69329c"} sx-9463d77`}>{product.availableStock.toLocaleString("az-AZ")}</td><td className="ui-tok-td">{azn(product.price)}</td><td className="ui-tok-td"><span className={`${badgeClass(product.availableStock <= 0 ? "red" : product.is_active ? "green" : "gray")}`}>{product.availableStock <= 0 ? "Stokda yoxdur" : product.is_active ? "Aktiv" : "Passiv"}</span></td>{isAdmin && <td className="ui-tok-td sx-4ddbe90"><button className="ui-tok-secondary-btn" onClick={() => edit(product)}>{product._catalogSource === "db" ? "Redaktə et" : "Kataloqa köçür"}</button>{product._catalogSource === "db" && <button className="ui-tok-del-btn" onClick={() => deleteProduct(product)}>Sil</button>}</td>}</tr>)}
        {!filtered.length && <tr><td className="ui-tok-td" colSpan={8}>{loading ? "Yüklənir…" : "Məhsul yoxdur."}</td></tr>}
      </tbody></table>
      <LoadMoreBar hasMore={hasMore} onLoadMore={loadMore} loading={loading} />
    </div>
  </div>;
}
