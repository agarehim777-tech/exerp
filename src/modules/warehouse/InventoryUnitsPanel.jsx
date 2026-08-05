import { useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { DataTable, EmptyState, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useInventoryUnits } from "../../shared/hooks/useInventoryUnits.js";
import { money } from "../../services/format.js";

const emptyUnit = {
  warehouse_id: "", product_id: "", serial_no: "", imei: "", batch_no: "", expiry_date: "",
  location_code: "", rack_code: "", bin_code: "", quantity: 1, unit_cost: 0, status: "available",
};

export function InventoryUnitsPanel({ warehouses = [], products = [], selectedWarehouseId = "all" }) {
  const { activeTenantId } = useAuth();
  const { units, loading, error, save, remove } = useInventoryUnits(activeTenantId);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const warehouseById = useMemo(() => new Map(warehouses.map((item) => [item.id, item])), [warehouses]);
  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const visibleUnits = selectedWarehouseId === "all" ? units : units.filter((unit) => unit.warehouse_id === selectedWarehouseId);

  function openCreate() {
    setEditor({ ...emptyUnit, warehouse_id: selectedWarehouseId === "all" ? warehouses[0]?.id || "" : selectedWarehouseId, product_id: products[0]?.id || "" });
  }

  async function submit(event) {
    event.preventDefault();
    await save(editor);
    setEditor(null);
    setNotice("Stok vahidi və lokasiya məlumatı saxlanıldı.");
  }

  async function removeUnit(unit) {
    if (!window.confirm(`${unit.imei || unit.serial_no || unit.batch_no || "Stok vahidi"} silinsin?`)) return;
    await remove(unit.id);
    setNotice("Stok vahidi silindi.");
  }

  return (
    <Panel className="inventory-unit-panel">
      <PanelHeader
        title="Seriya, partiya və lokasiya reyestri"
        subtitle={`${visibleUnits.length} stok vahidi · IMEI, batch, rəf və bin izləmə`}
        icon={Boxes}
        action={<button className="primary-btn" onClick={openCreate} disabled={!warehouses.length || !products.length}><Plus size={16} /> Stok vahidi</button>}
      />
      {(notice || error) && <div className={error ? "inline-alert danger" : "inline-alert success"}>{error?.message || notice}</div>}
      {loading ? <EmptyState title="Stok vahidləri yüklənir" /> : (
        <DataTable
          columns={["Məhsul", "Anbar", "IMEI / Serial", "Partiya", "Lokasiya", "Miqdar", "Maya", "Status", "Əməl"]}
          rows={visibleUnits.map((unit) => [
            <TwoLine title={productById.get(unit.product_id)?.name || "Məhsul"} subtitle={productById.get(unit.product_id)?.sku || unit.product_id} />,
            warehouseById.get(unit.warehouse_id)?.name || unit.warehouse_id,
            <TwoLine title={unit.imei || unit.serial_no || "—"} subtitle={unit.imei && unit.serial_no ? unit.serial_no : ""} />,
            <TwoLine title={unit.batch_no || "—"} subtitle={unit.expiry_date ? `Son istifadə: ${unit.expiry_date}` : ""} />,
            [unit.location_code, unit.rack_code, unit.bin_code].filter(Boolean).join(" / ") || "—",
            unit.quantity,
            money(unit.unit_cost),
            <StatusBadge status={unit.status} />,
            <div className="table-actions">
              <button className="icon-btn" title="Redaktə et" onClick={() => setEditor({ ...unit })}><Pencil size={15} /></button>
              <button className="icon-btn danger" title="Sil" onClick={() => removeUnit(unit)}><Trash2 size={15} /></button>
            </div>,
          ])}
        />
      )}

      {editor && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card inventory-unit-modal" onSubmit={submit}>
            <div className="modal-head"><div><h2>{editor.id ? "Stok vahidini redaktə et" : "Yeni stok vahidi"}</h2><p>Seriya və ya partiya izləmə məlumatlarını daxil edin.</p></div><button type="button" className="icon-btn" onClick={() => setEditor(null)}><X size={18} /></button></div>
            <div className="production-form-grid">
              <label><span>Anbar</span><select value={editor.warehouse_id} onChange={(event) => setEditor({ ...editor, warehouse_id: event.target.value })} required>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span>Məhsul</span><select value={editor.product_id} onChange={(event) => setEditor({ ...editor, product_id: event.target.value })} required>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span>IMEI</span><input value={editor.imei || ""} onChange={(event) => setEditor({ ...editor, imei: event.target.value })} /></label>
              <label><span>Serial</span><input value={editor.serial_no || ""} onChange={(event) => setEditor({ ...editor, serial_no: event.target.value })} /></label>
              <label><span>Partiya</span><input value={editor.batch_no || ""} onChange={(event) => setEditor({ ...editor, batch_no: event.target.value })} /></label>
              <label><span>Son istifadə</span><input type="date" value={editor.expiry_date || ""} onChange={(event) => setEditor({ ...editor, expiry_date: event.target.value })} /></label>
              <label><span>Zona</span><input value={editor.location_code || ""} onChange={(event) => setEditor({ ...editor, location_code: event.target.value })} /></label>
              <label><span>Rəf</span><input value={editor.rack_code || ""} onChange={(event) => setEditor({ ...editor, rack_code: event.target.value })} /></label>
              <label><span>Bin</span><input value={editor.bin_code || ""} onChange={(event) => setEditor({ ...editor, bin_code: event.target.value })} /></label>
              <label><span>Miqdar</span><input type="number" min="0" step="0.001" value={editor.quantity} onChange={(event) => setEditor({ ...editor, quantity: event.target.value })} required /></label>
              <label><span>Vahid maya</span><input type="number" min="0" step="0.01" value={editor.unit_cost} onChange={(event) => setEditor({ ...editor, unit_cost: event.target.value })} /></label>
              <label><span>Status</span><select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value })}>{["available","reserved","quarantine","issued","sold","written_off"].map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditor(null)}>Ləğv et</button><button className="primary-btn" type="submit"><Save size={16} /> Saxla</button></div>
          </form>
        </div>
      )}
    </Panel>
  );
}
