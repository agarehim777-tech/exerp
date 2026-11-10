import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useFinancialStatements } from "../../shared/hooks/useFinancialStatements";
import { AGING_BUCKETS, AGING_LABELS } from "../../shared/lib/financialReports.js";
import { toLocalIsoDate } from "../../services/date.js";
import {
  azn,
} from "../../shared/ui/tokens.js";

import { Button, Card, Input, Notice, PageStack, StatGrid, Table, Tabs, Toolbar } from "../../shared/ui/primitives.tsx";

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

  if (!tenantId) return <Notice>Aktiv şirkət seçilməyib.</Notice>;

  const { profitAndLoss: pl, balanceSheet: bs, cashFlow: cf, aging } = fs;
  const applyPeriod = mode => { const now=new Date(); let from; if(mode==='month') from=new Date(now.getFullYear(),now.getMonth(),1); else if(mode==='quarter') from=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); else from=new Date(now.getFullYear(),0,1); fs.setRange({from:toLocalIsoDate(from),to:toLocalIsoDate(now)}); };

  return (
    <PageStack>
      <Card>
        <Toolbar>
          <label className="ui-field">
            Başlanğıc
            <Input
              type="date"
              value={fs.range.from}
              onChange={(e) => fs.setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </label>
          <label className="ui-field">
            Son
            <Input
              type="date"
              value={fs.range.to}
              onChange={(e) => fs.setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </label>
          <Button onClick={fs.reload} disabled={fs.loading}>
            {fs.loading ? "Hesablanır…" : "Yenilə"}
          </Button>
          <div className="ui-table-actions"><Button variant="secondary" onClick={()=>applyPeriod('month')}>Bu ay</Button><Button variant="secondary" onClick={()=>applyPeriod('quarter')}>Bu rüb</Button><Button variant="secondary" onClick={()=>applyPeriod('year')}>Bu il</Button></div>
        </Toolbar>
        <div className="ui-help-text ui-spacer-top">
          Mənbə: Mühasibat jurnalı və satış anındakı tarixi maya dəyəri
          {fs.degraded ? " · Real-time bağlantı bərpa olunur" : " · Canlı yenilənir"}
        </div>
      </Card>

      <StatGrid>
        <article className="ui-stat-card">
          <div className="ui-stat-label">Gəlir</div>
          <div className="ui-stat-value">{azn(pl.totalRevenue)}</div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-label">Xərc</div>
          <div className="ui-stat-value">{azn(pl.totalExpense)}</div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-label">Xalis mənfəət</div>
          <div className={`ui-stat-value ${pl.netProfit < 0 ? "amount-due" : "amount-positive"}`}>{azn(pl.netProfit)}</div>
        </article>
        <article className="ui-stat-card">
          <div className="ui-stat-label">Vaxtı keçmiş debitor</div>
          <div className={`ui-stat-value ${aging.overdue ? "amount-due" : "amount-positive"}`}>{azn(aging.overdue)}</div>
        </article>
      </StatGrid>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {fs.error && <Notice tone="danger">Xəta: {fs.error.message}</Notice>}

      {tab === "pl" && (
        <Card>
          <h3 className="ui-section-title">Mənfəət və zərər ({fs.range.from} — {fs.range.to})</h3>
          <SectionTable title="Gəlirlər" rows={pl.revenue} total={pl.totalRevenue} />
          <SectionTable title="Xərclər" rows={pl.expenses} total={pl.totalExpense} />
          <div className="ui-summary-line">
            Xalis nəticə: {azn(pl.netProfit)} · Marja: {pl.margin}%
          </div>
        </Card>
      )}

      {tab === "bs" && (
        <Card>
          <h3 className="ui-section-title">Balans hesabatı</h3>
          <SectionTable title="Aktivlər" rows={bs.assets} total={bs.totalAssets} />
          <SectionTable title="Öhdəliklər" rows={bs.liabilities} total={bs.totalLiabilities} />
          <SectionTable
            title="Kapital"
            rows={[...bs.equity, { code: "—", name: "Dövrün mənfəəti", amount: bs.netProfit }]}
            total={bs.totalEquity}
          />
          <div className="ui-spacer-top">
            <span className={`ui-badge ${bs.balanced ? "ui-badge-success" : "ui-badge-danger"}`}>
              {bs.balanced ? "Balans bərabərdir" : `Fərq: ${azn(bs.difference)}`}
            </span>
          </div>
        </Card>
      )}

      {tab === "cf" && (
        <Card>
          <h3 className="ui-section-title">Pul axını (kassa/bank)</h3>
          <div className="ui-table-wrap"><Table className="ui-table">
            <thead>
              <tr>
                <th >Ay</th><th >Mədaxil</th><th >Məxaric</th>
                <th >Xalis</th><th >Kumulyativ</th>
              </tr>
            </thead>
            <tbody>
              {cf.rows.map((row) => (
                <tr key={row.month}>
                  <td >{row.month}</td>
                  <td >{azn(row.inflow)}</td>
                  <td >{azn(row.outflow)}</td>
                  <td className={row.net < 0 ? "amount-due is-numeric" : "is-numeric"}>{azn(row.net)}</td>
                  <td className="ui-emphasis is-numeric">{azn(row.cumulative)}</td>
                </tr>
              ))}
              {!cf.rows.length && <tr><td  colSpan={5}>Seçilmiş dövrdə kassa əməliyyatı yoxdur.</td></tr>}
            </tbody>
          </Table></div>
          <div className="ui-summary-line">
            Ümumi: mədaxil {azn(cf.inflow)} · məxaric {azn(cf.outflow)} · xalis {azn(cf.net)}
          </div>
        </Card>
      )}

      {tab === "ar" && (
        <Card>
          <h3 className="ui-section-title">Debitor borclarının yaşlanması ({aging.asOf})</h3>
          <div className="ui-table-wrap"><Table className="ui-table">
            <thead>
              <tr>
                <th >Müştəri</th>
                {AGING_BUCKETS.map((key) => <th key={key} >{AGING_LABELS[key]}</th>)}
                <th >Cəmi</th>
              </tr>
            </thead>
            <tbody>
              {aging.rows.map((row) => (
                <tr key={row.customerId}>
                  <td >{row.customerName}</td>
                  {AGING_BUCKETS.map((key) => (
                    <td key={key} className={key === "d90_plus" && row[key] ? "amount-due is-numeric" : "is-numeric"}>
                      {row[key] ? azn(row[key]) : "—"}
                    </td>
                  ))}
                  <td className="ui-emphasis is-numeric">{azn(row.total)}</td>
                </tr>
              ))}
              {!aging.rows.length && (
                <tr><td  colSpan={AGING_BUCKETS.length + 2}>Açıq debitor borcu yoxdur.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="ui-emphasis is-numeric">Cəmi</td>
                {AGING_BUCKETS.map((key) => (
                  <td key={key} className="ui-emphasis is-numeric">{azn(aging.totals[key])}</td>
                ))}
                <td className="ui-emphasis is-numeric">{azn(aging.grandTotal)}</td>
              </tr>
            </tfoot>
          </Table></div>
        </Card>
      )}
      {tab === "forecast" && <Card><h3 className="ui-section-title">Növbəti 3 ay üzrə cash-flow proqnozu</h3><p className="ui-help-text">Mədaxil açıq fakturaların son tarixindən, məxaric isə seçilmiş dövrün aylıq ortalamasından hesablanır.</p><div className="ui-table-wrap"><Table className="ui-table"><thead><tr><th >Ay</th><th >Gözlənilən mədaxil</th><th >Proqnoz məxaric</th><th >Xalis dəyişmə</th><th >Proqnoz qalıq</th></tr></thead><tbody>{fs.cashFlowForecast.rows.map(row=><tr key={row.month}><td >{row.month}</td><td >{azn(row.expectedInflow)}</td><td >{azn(row.expectedOutflow)}</td><td className={row.net < 0 ? "amount-due is-numeric" : "amount-positive is-numeric"}>{azn(row.net)}</td><td className={`ui-emphasis is-numeric ${row.cumulative < 0 ? "amount-due" : ""}`}>{azn(row.cumulative)}</td></tr>)}</tbody></Table></div></Card>}
    </PageStack>
  );
}

function SectionTable({ title, rows, total }) {
  return (
    <div className="ui-spacer-top">
      <h4 className="ui-section-title">{title}</h4>
      <div className="ui-table-wrap"><Table className="ui-table">
        <thead>
          <tr><th >Kod</th><th >Hesab</th><th >Məbləğ</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.code}-${index}`}>
              <td >{row.code}</td>
              <td >{row.name}</td>
              <td >{azn(row.amount)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td  colSpan={3}>Qeyd yoxdur.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="ui-emphasis is-numeric" colSpan={2}>Cəmi</td>
            <td className="ui-emphasis is-numeric">{azn(total)}</td>
          </tr>
        </tfoot>
      </Table></div>
    </div>
  );
}
