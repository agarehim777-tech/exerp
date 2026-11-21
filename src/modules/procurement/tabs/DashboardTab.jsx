import { AlertTriangle, PackageCheck, Truck } from "lucide-react";
import { Empty, IconButton, Panel, money, today } from "../procurementShared.jsx";

export function DashboardTab({ purchaseOrders, poMetrics, onCreatePo, onReceive }) {
  const latePo = purchaseOrders.filter((po) => po.expected_date && po.expected_date < today() && ["draft", "approved", "partial"].includes(po.status));
  const actionPo = purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status)).slice(0, 6);

  return (
    <section className="procurement-dashboard-grid procurement-page-styles-dashboard-grid">
      <Panel title="Təhvil/mədaxil gözləyən PO-lar" icon={Truck}>
        {actionPo.length === 0 ? (
          <Empty title="Mədaxil gözləyən PO yoxdur." />
        ) : (
          actionPo.map((po) => (
            <div key={po.id} className="procurement-page-styles-compact-row">
              <div>
                <strong>{po.po_number}</strong>
                <small>{po.vendors?.name || "Təchizatçı yoxdur"} · {money(poMetrics.get(po.id)?.total || 0, po.currency)}</small>
              </div>
              <div className="procurement-page-styles-row-actions">
                <IconButton icon={PackageCheck} label="Mədaxil" onClick={() => onReceive(po.id)} />
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Risk və istisnalar" icon={AlertTriangle}>
        {latePo.length === 0 ? (
          <Empty title="Gecikən PO yoxdur." />
        ) : (
          <>
            {latePo.map((po) => (
              <div key={po.id} className="procurement-page-styles-warning-row">
                <AlertTriangle size={16} />
                <div>
                  <strong>{po.po_number}</strong>
                  <small>Gözlənilən tarix keçib: {po.expected_date}</small>
                </div>
              </div>
            ))}
          </>
        )}
      </Panel>
    </section>
  );
}
