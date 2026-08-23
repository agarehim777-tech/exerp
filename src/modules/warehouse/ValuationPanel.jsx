import { useEffect, useMemo, useState } from "react";
import { valuateByProduct, summarizeValuation } from "../../shared/utils/inventoryValuation";
import { azn, badge, card, input, statLabel, statTile, statValue, table, td, th } from "../../shared/ui/tokens.js";

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
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Dəyərləmə və maya dəyəri</h3>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...input, width: 220 }}>
          <option value="fifo">FIFO (ilk giriş — ilk çıxış)</option>
          <option value="average">Çəkili orta maya</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
        <div style={statTile}>
          <div style={statLabel}>{method === "fifo" ? "FIFO qalıq dəyəri" : "Çəkili orta qalıq dəyəri"}</div>
          <div style={statValue}>{azn(totals.inventoryValue)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>COGS (satılan malın mayası)</div>
          <div style={statValue}>{azn(totals.cogs)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Məhsul sayı</div>
          <div style={statValue}>{totals.productCount}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Çatışmazlıq (backorder)</div>
          <div style={{ ...statValue, color: totals.shortageQty ? "#b23a3a" : "#064e3b" }}>
            {totals.shortageQty.toLocaleString("az-AZ")}
          </div>
        </div>
      </div>

      {hasQuantityMismatch && !loading && (
        <div style={{ color: "#b91c1c", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          Hərəkət tarixçəsi ilə cari stok uyğun deyil: tarixçə {ledgerQty.toLocaleString("az-AZ")}, cari qalıq {currentQty.toLocaleString("az-AZ")}. Dəyər hesabatı yoxlanmalıdır.
        </div>
      )}

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Məhsul</th><th style={th}>SKU</th><th style={th}>Qalıq</th>
            <th style={th}>Vahid maya</th><th style={th}>Qalıq dəyəri</th><th style={th}>COGS</th><th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const product = nameById.get(row.productId) || {};
            const currentProductQty = balanceQtyByProduct.get(String(row.productId || "")) || 0;
            const quantityMismatch = Math.abs(Number(row.qtyOnHand) - currentProductQty) > 0.0001;
            return (
              <tr key={row.productId || "unknown"}>
                <td style={td}>{product.name || "Naməlum məhsul"}</td>
                <td style={td}>{product.sku || "—"}</td>
                <td style={{ ...td, fontWeight: 600, color: row.qtyOnHand < 0 ? "#b23a3a" : undefined }}>
                  {row.qtyOnHand.toLocaleString("az-AZ")}
                </td>
                <td style={td}>{azn(row.unitCost)}</td>
                <td style={td}>{azn(row.inventoryValue)}</td>
                <td style={td}>{azn(row.cogs)}</td>
                <td style={td}>
                  <span style={badge(row.shortageQty || quantityMismatch ? "red" : "green")}>
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
            <tr><td style={td} colSpan={7}>{loading ? "Yüklənir…" : "Hərəkət yoxdur — dəyərləmə üçün mədaxil/məxaric qeyd edin."}</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        Qeyd: hesablama bütün anbar hərəkətləri ({movements.length.toLocaleString("az-AZ")}) üzərində aparılır və maya dəyəri boş olan mədaxillərdə əvvəlki maya tətbiq edilir.
      </div>
    </div>
  );
}
