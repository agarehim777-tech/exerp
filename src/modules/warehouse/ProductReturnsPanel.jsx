import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number(value || 0).toLocaleString("az-AZ");
const typeLabel = { customer: "Müştəri qaytarması", vendor: "Vendor qaytarması" };
const conditionLabel = { saleable: "Satışa uyğundur", damaged: "Zədəli", defective: "Qüsurlu" };
const dispositionLabel = { restock: "Yenidən satış stoku", quarantine: "Karantin", vendor_return: "Vendor qaytarması", write_off: "Silinmə" };

export default function ProductReturnsPanel({ product, warehouses = [], orders = [] }) {
  const { activeTenantId } = useAuth();
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ return_type: "customer", warehouse_id: "", order_id: "", quantity: 1, condition: "saleable", disposition: "restock", reason: "" });

  const productOrders = useMemo(() => orders.filter((order) => (order.productLines || []).some((line) => String(line.productId || line.product_id || "") === String(product.id))), [orders, product.id]);

  const load = async () => {
    if (!activeTenantId || !product?.id) return;
    const { data, error } = await supabase.from("inventory_return_lines")
      .select("*, return:inventory_returns!inner(id,return_no,return_type,status,reason,created_at,warehouse:warehouses(name),order:orders(order_no))")
      .eq("product_id", product.id).eq("return.tenant_id", activeTenantId).order("created_at", { ascending: false });
    if (error) { setMessage(error.code === "42P01" ? "Qaytarma migration-ı hələ bazaya tətbiq edilməyib." : error.message); return; }
    setRows(data || []);
  };

  useEffect(() => { load(); }, [activeTenantId, product?.id]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!form.warehouse_id) throw new Error("Anbar seçin.");
      const returnNo = `RET-${today().replaceAll("-", "").slice(2)}-${String(rows.length + 1).padStart(3, "0")}`;
      const { data: header, error: headerError } = await supabase.from("inventory_returns").insert({
        tenant_id: activeTenantId, return_no: returnNo, return_type: form.return_type,
        warehouse_id: form.warehouse_id, order_id: form.return_type === "customer" ? form.order_id || null : null,
        reason: form.reason || null,
      }).select().single();
      if (headerError) throw headerError;
      const { error: lineError } = await supabase.from("inventory_return_lines").insert({
        tenant_id: activeTenantId, return_id: header.id, product_id: product.id,
        quantity: Number(form.quantity), condition: form.condition, disposition: form.disposition,
      });
      if (lineError) throw lineError;
      const { error: completeError } = await supabase.rpc("complete_inventory_return", { _return: header.id });
      if (completeError) throw completeError;
      setMessage(`${returnNo} tamamlandı və stok hərəkəti yaradıldı.`);
      setForm((current) => ({ ...current, quantity: 1, reason: "" }));
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const setType = (returnType) => setForm((current) => ({ ...current, return_type: returnType, disposition: returnType === "vendor" ? "vendor_return" : "restock" }));
  const setCondition = (condition) => setForm((current) => ({ ...current, condition, disposition: condition === "saleable" ? "restock" : "quarantine" }));

  return <section className="product-return-workspace">
    <h3><RotateCcw size={17} /> Qaytarma prosesi</h3>
    <form onSubmit={submit} className="product-return-form">
      <label>Növ<select value={form.return_type} onChange={(e) => setType(e.target.value)}><option value="customer">Müştəri</option><option value="vendor">Vendor</option></select></label>
      <label>Anbar<select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}><option value="">Seçin</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      {form.return_type === "customer" && <label>Satış<select value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}><option value="">Bağlantısız</option>{productOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNo || order.order_no || order.id}</option>)}</select></label>}
      <label>Miqdar<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
      <label>Vəziyyət<select value={form.condition} onChange={(e) => setCondition(e.target.value)}><option value="saleable">Satışa uyğun</option><option value="damaged">Zədəli</option><option value="defective">Qüsurlu</option></select></label>
      <label>Qərar<select value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.target.value })}><option value="restock">Yenidən satış</option><option value="quarantine">Karantin</option><option value="vendor_return">Vendor qaytarması</option><option value="write_off">Silinmə</option></select></label>
      <label className="wide">Səbəb<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Qaytarma səbəbi" /></label>
      <button className="primary-btn" disabled={busy}>{busy ? "İşlənir..." : "Qaytarmanı tamamla"}</button>
    </form>
    {message && <p className="product-return-message">{message}</p>}
    <div className="warehouse-balance-table-wrap"><table className="warehouse-balance-table"><thead><tr><th>Nömrə</th><th>Növ</th><th>Miqdar</th><th>Vəziyyət</th><th>Qərar</th><th>Anbar</th><th>Status</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td>{row.return?.return_no}</td><td>{typeLabel[row.return?.return_type]}</td><td>{number(row.quantity)}</td><td>{conditionLabel[row.condition]}</td><td>{dispositionLabel[row.disposition]}</td><td>{row.return?.warehouse?.name || "—"}</td><td>{row.return?.status === "completed" ? "Tamamlandı" : row.return?.status}</td></tr>)}
      {!rows.length && <tr><td colSpan="7">Bu məhsul üzrə qaytarma yoxdur.</td></tr>}
    </tbody></table></div>
  </section>;
}
