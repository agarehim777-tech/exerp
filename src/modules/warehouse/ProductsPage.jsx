import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useProducts } from "../../shared/hooks/useProducts.js";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { card, input, primaryBtn, secondaryBtn, delBtn, table, th, td, msgBox, badge, azn } from "../../shared/ui/tokens.js";
import LoadMoreBar from "../../components/LoadMoreBar.jsx";

const emptyProduct = { id: "", sku: "", name: "", description: "", unit: "ədəd", price: "", currency: "AZN", vat_rate: 18, is_active: true };
const summaryCard = { background: "#fff", border: "1px solid #e6dfc9", borderRadius: 12, padding: "15px 18px", display: "grid", gap: 5 };
const summaryLabel = { fontSize: 12, color: "#718079", fontWeight: 650 };
const summaryValue = { fontSize: 22, lineHeight: 1.2, color: "#173f32" };

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
      const current = inventoryByKey.get(key) || { total: 0, reserved: 0, reorderLevel: 0 };
      current.total += Number(row.total ?? row.qty ?? row.on_hand ?? 0);
      current.reserved += Number(row.reserved || 0);
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
      const inventory = inventoryByKey.get(key) || { total: 0, reserved: 0, reorderLevel: 0 };
      return {
        ...product,
        totalStock: inventory.total,
        reservedStock: inventory.reserved,
        availableStock: Math.max(0, inventory.total - inventory.reserved),
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
    if (!window.confirm(`“${product.name}” məhsulu silinsin?`)) return;
    if (product._catalogSource !== "db") { setMsg("Bu köhnə məhsul stok məlumatından gəlir. Əvvəl redaktə edib canlı kataloqa köçürün."); return; }
    try { await remove(product.id); setMsg("Məhsul silindi."); }
    catch (nextError) { setMsg(`Məhsul silinmədi: ${nextError.message}`); }
  };

  return <div style={{ display: "grid", gap: 16 }}>
    <div><h1 style={{ margin: 0, fontSize: 26, color: "#12372c" }}>Məhsullar</h1><p style={{ margin: "6px 0 0", fontSize: 14, color: "#66756f" }}>Məhsul kataloqu, SKU, satış qiyməti və ƏDV məlumatları.</p></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 12 }}>
      <div style={summaryCard}><span style={summaryLabel}>Ümumi qalıq</span><strong style={summaryValue}>{stockSummary.total.toLocaleString("az-AZ")}</strong></div>
      <div style={summaryCard}><span style={summaryLabel}>Rezerv olunmuş</span><strong style={{ ...summaryValue, color: "#9a6700" }}>{stockSummary.reserved.toLocaleString("az-AZ")}</strong></div>
      <div style={summaryCard}><span style={summaryLabel}>Satışa uyğun</span><strong style={{ ...summaryValue, color: "#087f5b" }}>{stockSummary.available.toLocaleString("az-AZ")}</strong></div>
    </div>
    {msg && <div style={msgBox}>{msg}</div>}{error && <div style={msgBox}>Xəta: {error.message}</div>}
    {isAdmin && <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "130px 1.2fr 1fr 110px 110px auto auto", gap: 10, alignItems: "end" }}>
      <input required placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={input} />
      <input required placeholder="Məhsulun adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
      <input placeholder="Təsvir" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} style={input} />
      <input placeholder="Vahid" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={input} />
      <input required type="number" min="0" step="0.01" placeholder="Qiymət" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={input} />
      <button type="submit" style={primaryBtn}>{form.id ? "Yadda saxla" : "+ Məhsul"}</button>
      {form.id && <button type="button" style={secondaryBtn} onClick={() => setForm(emptyProduct)}>Ləğv et</button>}
    </form>}
    <div style={card}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}><h2 style={{ margin: 0, fontSize: 19, color: "#12372c" }}>Məhsullar ({filtered.length})</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input placeholder="SKU, ad və ya təsvir üzrə axtar…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...input, width: 300 }} /><select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} style={input}><option value="all">Bütün məhsullar</option><option value="available">Satışa uyğun</option><option value="reserved">Rezervdə olanlar</option><option value="low">Aşağı stok</option><option value="out">Stokda yoxdur</option></select></div></div>
      <table style={table}><thead><tr><th style={th}>SKU</th><th style={th}>Məhsul</th><th style={th}>Qalıq</th><th style={th}>Rezerv olunmuş</th><th style={th}>Satışa uyğun</th><th style={th}>Qiymət</th><th style={th}>Status</th>{isAdmin && <th style={th}>Əməliyyat</th>}</tr></thead><tbody>
        {filtered.map((product) => <tr key={`${product._catalogSource}-${product.id}`}><td style={td}><b>{product.sku}</b></td><td style={td}>{product.name}<div style={{ fontSize: 12, color: "#7a8782" }}>{product.description || (product._catalogSource === "db" ? "—" : "Əvvəlki anbar məlumatından bərpa edilib")}</div></td><td style={{ ...td, fontWeight: 700 }}>{product.totalStock.toLocaleString("az-AZ")}</td><td style={{ ...td, color: product.reservedStock > 0 ? "#9a6700" : "#66756f", fontWeight: 650 }}>{product.reservedStock.toLocaleString("az-AZ")}</td><td style={{ ...td, color: product.availableStock > 0 ? "#087f5b" : "#c0392b", fontWeight: 750 }}>{product.availableStock.toLocaleString("az-AZ")}</td><td style={td}>{azn(product.price)}</td><td style={td}><span style={badge(product.availableStock <= 0 ? "red" : product.is_active ? "green" : "gray")}>{product.availableStock <= 0 ? "Stokda yoxdur" : product.is_active ? "Aktiv" : "Passiv"}</span></td>{isAdmin && <td style={{ ...td, whiteSpace: "nowrap" }}><button style={secondaryBtn} onClick={() => edit(product)}>{product._catalogSource === "db" ? "Redaktə et" : "Kataloqa köçür"}</button>{product._catalogSource === "db" && <button style={delBtn} onClick={() => deleteProduct(product)}>Sil</button>}</td>}</tr>)}
        {!filtered.length && <tr><td style={td} colSpan={8}>{loading ? "Yüklənir…" : "Məhsul yoxdur."}</td></tr>}
      </tbody></table>
      <LoadMoreBar hasMore={hasMore} onLoadMore={loadMore} loading={loading} />
    </div>
  </div>;
}
