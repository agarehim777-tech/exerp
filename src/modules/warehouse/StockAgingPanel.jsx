import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { readAllRows } from "../../services/readAllRows.js";
import { azn, badgeClass } from "../../shared/ui/tokens.js";
import { buildAgingRows, isMissingAgingView } from "./stockAging.js";
import { Select, Table } from "../../shared/ui/primitives.tsx";

export default function StockAgingPanel({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [bucket, setBucket] = useState("Hamısı");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAging() {
      setLoading(true);
      setError("");

      // The view has no id column; these columns together identify a cost layer for paging.
      const viewResult = await readAllRows(() => supabase
        .from("inventory_aging_v")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("age_days", { ascending: false })
        .order("received_at")
        .order("warehouse_id")
        .order("product_id")
        .order("unit_cost")
        .order("remaining_qty"));

      if (!viewResult.error) {
        if (active) {
          setRows(viewResult.data || []);
          setLoading(false);
        }
        return;
      }

      if (!isMissingAgingView(viewResult.error)) {
        if (active) {
          setRows([]);
          setError(viewResult.error.message || "Stok yaşlandırması yüklənmədi.");
          setLoading(false);
        }
        return;
      }

      const layerResult = await readAllRows(() => supabase
        .from("inventory_cost_layers")
        .select("tenant_id, warehouse_id, product_id, received_at, remaining_qty, unit_cost, product:products(name, sku)")
        .eq("tenant_id", tenantId)
        .gt("remaining_qty", 0)
        .order("received_at", { ascending: true })
        .order("id"));

      if (active) {
        setRows(layerResult.error ? [] : buildAgingRows(layerResult.data));
        setError(layerResult.error?.message || "");
        setLoading(false);
      }
    }

    if (tenantId) loadAging();
    else {
      setRows([]);
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [tenantId]);

  const visible = useMemo(
    () => bucket === "Hamısı" ? rows : rows.filter((row) => row.aging_bucket === bucket),
    [rows, bucket],
  );
  const slow = rows.filter((row) => Number(row.age_days) > 90);
  const slowValue = slow.reduce((sum, row) => sum + Number(row.stock_value || 0), 0);

  return (
    <div className="ui-tok-card">
      <div className="u-display-flex u-justify-content-space_between u-gap-12px u-align-items-center u-flex-wrap-wrap">
        <div>
          <h3 className="u-margin-0">Stok yaşlandırması</h3>
          <p className="u-margin-4px_0_0 u-color-text_secondary">FIFO maya layları üzrə yavaş hərəkət edən mallar</p>
        </div>
        <Select value={bucket} onChange={(event) => setBucket(event.target.value)} className="ui-tok-input sx-1dfda96">
          {["Hamısı", "0-30", "31-90", "91-180", "180+"].map((item) => <option key={item}>{item}</option>)}
        </Select>
      </div>

      <div className="u-display-flex u-gap-10px u-margin-14px_0 u-flex-wrap-wrap">
        <span className={`${badgeClass(slow.length ? "red" : "green")}`}>{slow.length} yavaş məhsul</span>
        <b>{azn(slowValue)} riskli stok dəyəri</b>
      </div>

      {error && <div className="u-color-danger u-margin-bottom-12px">Stok yaşlandırması yüklənmədi: {error}</div>}

      <div className="u-overflow-x-auto">
        <Table className="ui-tok-table">
          <thead>
            <tr>
              <th className="ui-tok-th">Məhsul</th>
              <th className="ui-tok-th">SKU</th>
              <th className="ui-tok-th">Yaş</th>
              <th className="ui-tok-th">Qalıq</th>
              <th className="ui-tok-th">Vahid maya</th>
              <th className="ui-tok-th">Dəyər</th>
              <th className="ui-tok-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.product_id}-${row.warehouse_id}-${row.received_at}`}>
                <td className="ui-tok-td"><b>{row.product_name}</b></td>
                <td className="ui-tok-td">{row.sku || "—"}</td>
                <td className="ui-tok-td">{row.age_days} gün</td>
                <td className="ui-tok-td">{Number(row.remaining_qty).toLocaleString("az-AZ")}</td>
                <td className="ui-tok-td">{azn(row.unit_cost)}</td>
                <td className="ui-tok-td">{azn(row.stock_value)}</td>
                <td className="ui-tok-td">
                  <span className={`${badgeClass(Number(row.age_days) > 180 ? "red" : Number(row.age_days) > 90 ? "yellow" : "green")}`}>
                    {Number(row.age_days) > 180 ? "Donmuş" : Number(row.age_days) > 90 ? "Yavaş" : "Normal"}
                  </span>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr><td className="ui-tok-td" colSpan={7}>{loading ? "Yüklənir…" : "Yaşlandırma məlumatı yoxdur."}</td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
