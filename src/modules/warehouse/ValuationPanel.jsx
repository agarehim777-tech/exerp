import { useEffect, useMemo, useState } from "react";
import { valuateByProduct, summarizeValuation } from "../../shared/utils/inventoryValuation";
import { azn, badgeClass } from "../../shared/ui/tokens.js";
import { Select, Table } from "../../shared/ui/primitives.tsx";

/**
 * Anbar dəyərləməsi paneli — FIFO / çəkili orta maya və COGS.
 * Hesablama saf funksiyalar üzərində aparılır (src/shared/utils/inventoryValuation.ts).
 * Hərəkətlər siyahısı səhifələndiyi üçün burada tam tarixçə ayrıca yüklənir.
 */
export default function ValuationPanel({ loadMovements, products = [], balances = [] }) {
  const [method, setMethod] = useState("fifo");
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.resolve(loadMovements ? loadMovements() : []).then((rows) => {
      if (cancelled) return;
      setMovements(rows || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadMovements]);

  const nameById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(p.id, p));
    movements.forEach((m) => { if (m.product_id && !map.has(m.product_id)) map.set(m.product_id, m.product || {}); });
    return map;
  }, [products, movements]);

  const rows = useMemo(() => valuateByProduct(movements, method), [movements, method]);
  const totals = useMemo(() => summarizeValuation(rows), [rows]);
  const balanceQtyByProduct = useMemo(() => {
    const map = new Map();
    balances.forEach((balance) => {
      const productId = String(balance.product_id || "");
      map.set(productId, (map.get(productId) || 0) + Number(balance.qty ?? balance.on_hand ?? 0));
    });
    return map;
  }, [balances]);
  const ledgerQty = rows.reduce((sum, row) => sum + Number(row.qtyOnHand || 0), 0);
  const currentQty = [...balanceQtyByProduct.values()].reduce((sum, qty) => sum + qty, 0);
  const hasQuantityMismatch = Math.abs(ledgerQty - currentQty) > 0.0001;

  return (
    <div className="ui-tok-card">
      <div className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-flex-wrap-wrap">
        <h3 className="u-margin-top-0 u-margin-bottom-0">Dəyərləmə və maya dəyəri</h3>
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="ui-tok-input sx-69e6838">
          <option value="fifo">FIFO (ilk giriş — ilk çıxış)</option>
          <option value="average">Çəkili orta maya</option>
        </Select>
      </div>

      <div className="u-display-flex u-gap-12px u-flex-wrap-wrap u-margin-14px_0">
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">{method === "fifo" ? "FIFO qalıq dəyəri" : "Çəkili orta qalıq dəyəri"}</div>
          <div className="ui-tok-stat-value">{azn(totals.inventoryValue)}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">COGS (satılan malın mayası)</div>
          <div className="ui-tok-stat-value">{azn(totals.cogs)}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Məhsul sayı</div>
          <div className="ui-tok-stat-value">{totals.productCount}</div>
        </div>
        <div className="ui-tok-stat-tile">
          <div className="ui-tok-stat-label">Çatışmazlıq (backorder)</div>
          <div className={`ui-tok-stat-value ${totals.shortageQty ? "sx-9d7a4ce" : "sx-7c2de19"}`}>
            {totals.shortageQty.toLocaleString("az-AZ")}
          </div>
        </div>
      </div>

      {hasQuantityMismatch && !loading && (
        <div className="u-color-danger u-background-fff1f2 u-border-1px_solid_fecdd3 u-border-radius-8px u-padding-9px_12px u-margin-bottom-12px">
          Hərəkət tarixçəsi ilə cari stok uyğun deyil: tarixçə {ledgerQty.toLocaleString("az-AZ")}, cari qalıq {currentQty.toLocaleString("az-AZ")}. Dəyər hesabatı yoxlanmalıdır.
        </div>
      )}

      <Table className="ui-tok-table">
        <thead>
          <tr>
            <th className="ui-tok-th">Məhsul</th><th className="ui-tok-th">SKU</th><th className="ui-tok-th">Qalıq</th>
            <th className="ui-tok-th">Vahid maya</th><th className="ui-tok-th">Qalıq dəyəri</th><th className="ui-tok-th">COGS</th><th className="ui-tok-th">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const product = nameById.get(row.productId) || {};
            const currentProductQty = balanceQtyByProduct.get(String(row.productId || "")) || 0;
            const quantityMismatch = Math.abs(Number(row.qtyOnHand) - currentProductQty) > 0.0001;
            return (
              <tr key={row.productId || "unknown"}>
                <td className="ui-tok-td">{product.name || "Naməlum məhsul"}</td>
                <td className="ui-tok-td">{product.sku || "—"}</td>
                <td className={`ui-tok-td sx-e634e6d ${row.qtyOnHand < 0 ? "sx-9d7a4ce" : ""}`}>
                  {row.qtyOnHand.toLocaleString("az-AZ")}
                </td>
                <td className="ui-tok-td">{azn(row.unitCost)}</td>
                <td className="ui-tok-td">{azn(row.inventoryValue)}</td>
                <td className="ui-tok-td">{azn(row.cogs)}</td>
                <td className="ui-tok-td">
                  <span className={`${badgeClass(row.shortageQty || quantityMismatch ? "red" : "green")}`}>
                    {row.shortageQty
                      ? `Çatışmazlıq ${row.shortageQty}`
                      : quantityMismatch
                        ? `Cari qalıq: ${currentProductQty.toLocaleString("az-AZ")}`
                        : "Normal"}
                  </span>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td className="ui-tok-td" colSpan={7}>{loading ? "Yüklənir…" : "Hərəkət yoxdur — dəyərləmə üçün mədaxil/məxaric qeyd edin."}</td></tr>
          )}
        </tbody>
      </Table>
      <div className="u-font-size-12px u-opacity-0_7 u-margin-top-8px">
        Qeyd: hesablama bütün anbar hərəkətləri ({movements.length.toLocaleString("az-AZ")}) üzərində aparılır və maya dəyəri boş olan mədaxillərdə əvvəlki maya tətbiq edilir.
      </div>
    </div>
  );
}
