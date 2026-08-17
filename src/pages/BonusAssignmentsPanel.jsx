import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History, Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { Panel, PanelHeader, StatusBadge } from "../components/ui.jsx";
import { useOrders } from "../shared/hooks/useOrders.js";
import { useSalesBonusLedger } from "../shared/hooks/useSalesBonusLedger.js";

const today = () => new Date().toISOString().slice(0, 10);

export default function BonusAssignmentsPanel({ onRowsChange }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const { orders } = useOrders(tenantId);
  const ledger = useSalesBonusLedger(tenantId);
  const [orderId, setOrderId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([{ seller_name: "", rate: "" }]);
  const [message, setMessage] = useState("");

  const history = useMemo(
    () => ledger.assignments.filter((row) => row.order_id === orderId),
    [ledger.assignments, orderId],
  );
  const totalRate = lines.reduce((sum, line) => sum + Number(line.rate || 0), 0);

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      const allocations = lines
        .map((line) => ({ seller_name: line.seller_name.trim(), rate: Number(line.rate) }))
        .filter((line) => line.seller_name && line.rate > 0);
      if (!orderId) throw new Error("Sifariş seçin.");
      if (!allocations.length) throw new Error("Ən azı bir satıcı əlavə edin.");
      if (totalRate > 100) throw new Error("Ümumi bonus faizi 100%-dən çox ola bilməz.");
      await ledger.replaceAssignments(orderId, effectiveFrom, allocations, reason);
      setMessage("Yeni bonus bölgüsü tarixçəyə əlavə edildi. Köhnə bonuslar dəyişdirilmədi.");
      onRowsChange?.(ledger.rows);
    } catch (saveError) {
      setMessage(saveError.message || "Bonus bölgüsü saxlanmadı.");
    }
  }

  return (
    <Panel>
      <PanelHeader title="Sifariş üzrə bonus bölgüsü" subtitle="Yeni bölgü seçilən tarixdən sonrakı kassa daxilolmalarına tətbiq edilir" icon={History} />
      <form className="bonus-assignment-form" onSubmit={save}>
        <div className="bonus-assignment-head">
          <label><span>Sifariş</span><select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Sifariş seçin</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_no} · {order.customer?.name || "Müştəri yoxdur"}</option>)}</select></label>
          <label><span>Qüvvəyə minmə tarixi</span><input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required /></label>
          <label><span>Dəyişiklik səbəbi</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Məsələn: satıcı dəyişikliyi" /></label>
        </div>
        <div className="bonus-assignment-lines">
          {lines.map((line, index) => (
            <div className="bonus-assignment-line" key={index}>
              <input value={line.seller_name} onChange={(event) => setLines((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, seller_name: event.target.value } : row))} placeholder="Satıcının adı" required />
              <div className="bonus-rate-field"><input type="number" min="0.0001" max="100" step="0.0001" value={line.rate} onChange={(event) => setLines((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, rate: event.target.value } : row))} placeholder="Faiz" required /><span>%</span></div>
              <button type="button" className="icon-btn danger" aria-label="Satıcını sil" disabled={lines.length === 1} onClick={() => setLines((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="bonus-assignment-actions">
          <button type="button" className="secondary-btn compact" onClick={() => setLines((rows) => [...rows, { seller_name: "", rate: "" }])}><Plus size={15} /> Satıcı əlavə et</button>
          <span>Ümumi faiz: <strong>{totalRate}%</strong></span>
          <button className="primary-btn compact" type="submit" disabled={ledger.loading}><Save size={15} /> Bölgünü yadda saxla</button>
        </div>
      </form>
      {message ? <div className="bonus-assignment-message">{message}</div> : null}
      {ledger.error ? <div className="bonus-assignment-message error">{ledger.error.message}</div> : null}
      {orderId && history.length ? <div className="bonus-history"><h4>Bölgü tarixçəsi</h4>{history.map((row) => <div className="bonus-history-row" key={row.id}><strong>{row.seller_name}</strong><span>{Number(row.rate)}%</span><span>{row.effective_from} — {row.effective_to || "davam edir"}</span><StatusBadge status={row.effective_to ? "Bağlanıb" : "Aktiv"} /><small>{row.reason || "Səbəb qeyd edilməyib"}</small></div>)}</div> : null}
    </Panel>
  );
}
