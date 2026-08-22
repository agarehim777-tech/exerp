import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useFinancialStatements } from "../../shared/hooks/useFinancialStatements";
import { AGING_BUCKETS, AGING_LABELS } from "../../shared/lib/financialReports.js";
import {
  azn, badge, card, input, msgBox, primaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const TABS = [
  ["pl", "Mənfəət-Zərər"],
  ["bs", "Balans"],
  ["cf", "Pul axını"],
  ["forecast", "Cash-flow proqnozu"],
  ["ar", "Debitor yaşlanması"],
];

export default function FinancialStatementsPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const fs = useFinancialStatements(tenantId);
  const [tab, setTab] = useState("pl");

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  const { profitAndLoss: pl, balanceSheet: bs, cashFlow: cf, aging } = fs;
  const applyPeriod = mode => { const now=new Date(); let from; if(mode==='month') from=new Date(now.getFullYear(),now.getMonth(),1); else if(mode==='quarter') from=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); else from=new Date(now.getFullYear(),0,1); fs.setRange({from:from.toISOString().slice(0,10),to:now.toISOString().slice(0,10)}); };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Başlanğıc
            <input
              type="date"
              value={fs.range.from}
              onChange={(e) => fs.setRange((r) => ({ ...r, from: e.target.value }))}
              style={{ ...input, width: 170 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Son
            <input
              type="date"
              value={fs.range.to}
              onChange={(e) => fs.setRange((r) => ({ ...r, to: e.target.value }))}
              style={{ ...input, width: 170 }}
            />
          </label>
          <button type="button" style={primaryBtn} onClick={fs.reload} disabled={fs.loading}>
            {fs.loading ? "Hesablanır…" : "Yenilə"}
          </button>
          <div style={{display:"flex",gap:6}}><button type="button" style={tabBtn(false)} onClick={()=>applyPeriod('month')}>Bu ay</button><button type="button" style={tabBtn(false)} onClick={()=>applyPeriod('quarter')}>Bu rüb</button><button type="button" style={tabBtn(false)} onClick={()=>applyPeriod('year')}>Bu il</button></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}>
          <div style={statLabel}>Gəlir</div>
          <div style={statValue}>{azn(pl.totalRevenue)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Xərc</div>
          <div style={statValue}>{azn(pl.totalExpense)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Xalis mənfəət</div>
          <div style={{ ...statValue, color: pl.netProfit < 0 ? "#b23a3a" : "#064e3b" }}>{azn(pl.netProfit)}</div>
        </div>
        <div style={statTile}>
          <div style={statLabel}>Vaxtı keçmiş debitor</div>
          <div style={{ ...statValue, color: aging.overdue ? "#b23a3a" : "#064e3b" }}>{azn(aging.overdue)}</div>
        </div>
      </div>

      <div style={tabBar}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={tabBtn(tab === key)}>{label}</button>
        ))}
      </div>

      {fs.error && <div style={msgBox}>Xəta: {fs.error.message}</div>}

      {tab === "pl" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Mənfəət və zərər ({fs.range.from} — {fs.range.to})</h3>
          <SectionTable title="Gəlirlər" rows={pl.revenue} total={pl.totalRevenue} />
          <SectionTable title="Xərclər" rows={pl.expenses} total={pl.totalExpense} />
          <div style={{ marginTop: 12, fontWeight: 700 }}>
            Xalis nəticə: {azn(pl.netProfit)} · Marja: {pl.margin}%
          </div>
        </div>
      )}

      {tab === "bs" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Balans hesabatı</h3>
          <SectionTable title="Aktivlər" rows={bs.assets} total={bs.totalAssets} />
          <SectionTable title="Öhdəliklər" rows={bs.liabilities} total={bs.totalLiabilities} />
          <SectionTable
            title="Kapital"
            rows={[...bs.equity, { code: "—", name: "Dövrün mənfəəti", amount: bs.netProfit }]}
            total={bs.totalEquity}
          />
          <div style={{ marginTop: 12 }}>
            <span style={badge(bs.balanced ? "green" : "red")}>
              {bs.balanced ? "Balans bərabərdir" : `Fərq: ${azn(bs.difference)}`}
            </span>
          </div>
        </div>
      )}

      {tab === "cf" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Pul axını (kassa/bank)</h3>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Ay</th><th style={th}>Mədaxil</th><th style={th}>Məxaric</th>
                <th style={th}>Xalis</th><th style={th}>Kumulyativ</th>
              </tr>
            </thead>
            <tbody>
              {cf.rows.map((row) => (
                <tr key={row.month}>
                  <td style={td}>{row.month}</td>
                  <td style={td}>{azn(row.inflow)}</td>
                  <td style={td}>{azn(row.outflow)}</td>
                  <td style={{ ...td, color: row.net < 0 ? "#b23a3a" : undefined }}>{azn(row.net)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{azn(row.cumulative)}</td>
                </tr>
              ))}
              {!cf.rows.length && <tr><td style={td} colSpan={5}>Seçilmiş dövrdə kassa əməliyyatı yoxdur.</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontWeight: 600 }}>
            Ümumi: mədaxil {azn(cf.inflow)} · məxaric {azn(cf.outflow)} · xalis {azn(cf.net)}
          </div>
        </div>
      )}

      {tab === "ar" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Debitor borclarının yaşlanması ({aging.asOf})</h3>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Müştəri</th>
                {AGING_BUCKETS.map((key) => <th key={key} style={th}>{AGING_LABELS[key]}</th>)}
                <th style={th}>Cəmi</th>
              </tr>
            </thead>
            <tbody>
              {aging.rows.map((row) => (
                <tr key={row.customerId}>
                  <td style={td}>{row.customerName}</td>
                  {AGING_BUCKETS.map((key) => (
                    <td key={key} style={{ ...td, color: key === "d90_plus" && row[key] ? "#b23a3a" : undefined }}>
                      {row[key] ? azn(row[key]) : "—"}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 600 }}>{azn(row.total)}</td>
                </tr>
              ))}
              {!aging.rows.length && (
                <tr><td style={td} colSpan={AGING_BUCKETS.length + 2}>Açıq debitor borcu yoxdur.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Cəmi</td>
                {AGING_BUCKETS.map((key) => (
                  <td key={key} style={{ ...td, fontWeight: 700 }}>{azn(aging.totals[key])}</td>
                ))}
                <td style={{ ...td, fontWeight: 700 }}>{azn(aging.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {tab === "forecast" && <div style={card}><h3 style={{marginTop:0}}>Növbəti 3 ay üzrə cash-flow proqnozu</h3><p style={{color:'#64748b'}}>Mədaxil açıq fakturaların son tarixindən, məxaric isə seçilmiş dövrün aylıq ortalamasından hesablanır.</p><table style={table}><thead><tr><th style={th}>Ay</th><th style={th}>Gözlənilən mədaxil</th><th style={th}>Proqnoz məxaric</th><th style={th}>Xalis dəyişmə</th><th style={th}>Proqnoz qalıq</th></tr></thead><tbody>{fs.cashFlowForecast.rows.map(row=><tr key={row.month}><td style={td}>{row.month}</td><td style={td}>{azn(row.expectedInflow)}</td><td style={td}>{azn(row.expectedOutflow)}</td><td style={{...td,color:row.net<0?'#b23a3a':'#064e3b'}}>{azn(row.net)}</td><td style={{...td,fontWeight:700,color:row.cumulative<0?'#b23a3a':undefined}}>{azn(row.cumulative)}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

function SectionTable({ title, rows, total }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: "0 0 6px" }}>{title}</h4>
      <table style={table}>
        <thead>
          <tr><th style={th}>Kod</th><th style={th}>Hesab</th><th style={th}>Məbləğ</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.code}-${index}`}>
              <td style={td}>{row.code}</td>
              <td style={td}>{row.name}</td>
              <td style={td}>{azn(row.amount)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td style={td} colSpan={3}>Qeyd yoxdur.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Cəmi</td>
            <td style={{ ...td, fontWeight: 700 }}>{azn(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
