import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

const number = (value) => Number(value || 0).toLocaleString("az-AZ");
const dispositionLabel = { restock: "Yenidən satış stoku", quarantine: "Problemli stok", vendor_return: "Vendor qaytarması", write_off: "Silinmə" };
const repairStatusLabel = { not_required: "Tələb olunmur", pending: "Təmir gözləyir", in_progress: "Təmirdə", repaired: "Təmir edildi", not_repairable: "Təmir mümkün deyil" };

export default function ProductReturnsPanel({ product, warehouses = [] }) {
  const { activeTenantId } = useAuth();
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [form, setForm] = useState({ warehouse_id: "", quantity: 1, disposition: "quarantine", reason: "" });

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
      if (!form.reason.trim()) throw new Error("Əməliyyatın səbəbini yazın.");
      const { error: actionError } = await supabase.rpc("record_problem_stock_action", {
        _product: product.id,
        _warehouse: form.warehouse_id,
        _quantity: Number(form.quantity),
        _action: form.disposition === "quarantine" ? "problem" : "write_off",
        _reason: form.reason.trim(),
      });
      if (actionError) throw actionError;
      setMessage(form.disposition === "quarantine"
        ? "Məhsul problemli stoka keçirildi. Fiziki qalıq dəyişmədi."
        : "Məhsul silindi və fiziki qalıq azaldıldı.");
      setForm((current) => ({ ...current, quantity: 1, reason: "" }));
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const changeRepairStatus = async (row, action) => {
    setBusyRow(row.id); setMessage("");
    try {
      const rpc = action === "start" ? "start_inventory_repair" : "complete_inventory_repair";
      const args = action === "start" ? { _line: row.id } : { _line: row.id, _note: null };
      const { error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      setMessage(action === "start"
        ? "Məhsul təmirə götürüldü. Problemli say fiziki qalıqda saxlanılır."
        : "Təmir tamamlandı. Məhsul fiziki qalıq dəyişmədən satışa uyğun stoka keçirildi.");
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusyRow(""); }
  };

  return <section className="product-return-workspace">
    <h3><RotateCcw size={17} /> Problemli məhsul və silinmə</h3>
    <p style={{ margin: "-4px 0 14px", color: "#66756f", fontSize: 13 }}>Anbarda olan məhsulu problemli stoka keçirin və ya fiziki qalıqdan silin.</p>
    <form onSubmit={submit} className="product-return-form">
      <label>Anbar<select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}><option value="">Seçin</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label>Miqdar<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
      <label>Əməliyyat<select value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.target.value })}><option value="quarantine">Problemli stok kimi qeyd et</option><option value="write_off">Məhsulu sil</option></select></label>
      <label className="wide">Səbəb *<input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Zədə, nasazlıq və ya silinmə səbəbi" /></label>
      <button className="primary-btn" disabled={busy}>{busy ? "İşlənir..." : form.disposition === "quarantine" ? "Problemli stoka keçir" : "Məhsulu sil"}</button>
    </form>
    {message && <p className="product-return-message">{message}</p>}
    <div className="warehouse-balance-table-wrap"><table className="warehouse-balance-table"><thead><tr><th>Nömrə</th><th>Miqdar</th><th>Əməliyyat</th><th>Səbəb</th><th>Anbar</th><th>Təmir statusu</th><th>İdarəetmə</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td>{row.return?.return_no}</td><td>{number(row.quantity)}</td><td>{dispositionLabel[row.disposition]}</td><td>{row.return?.reason || "—"}</td><td>{row.return?.warehouse?.name || "—"}</td><td>{repairStatusLabel[row.repair_status] || (row.disposition === "quarantine" ? "Təmir gözləyir" : "Tələb olunmur")}</td><td>
        {row.disposition === "quarantine" && row.return?.status === "completed" && !["repaired", "not_repairable"].includes(row.repair_status) ? (
          <span style={{ display: "inline-flex", gap: 8 }}>
            {(row.repair_status === "pending" || !row.repair_status) && <button type="button" className="secondary-btn" disabled={busyRow === row.id} onClick={() => changeRepairStatus(row, "start")}>Təmirə başla</button>}
            <button type="button" className="primary-btn" disabled={busyRow === row.id} onClick={() => changeRepairStatus(row, "complete")}>Təmiri tamamla</button>
          </span>
        ) : "—"}
      </td></tr>)}
      {!rows.length && <tr><td colSpan="7">Bu məhsul üzrə problemli stok və silinmə əməliyyatı yoxdur.</td></tr>}
    </tbody></table></div>
  </section>;
}
