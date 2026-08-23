import React from 'react';
import { BarChart3, CircleDollarSign, ReceiptText, ShoppingCart, TrendingUp } from 'lucide-react';
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSalesDashboard } from '../../shared/hooks/useSalesDashboard.js';

const money = (value) => `${Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: 0 })} ₼`;

const STATUS_META = {
  draft: { label: 'Qaralama', color: '#94a3b8' },
  pending: { label: 'Gözləyir', color: '#f59e0b' },
  confirmed: { label: 'Təsdiqlənib', color: '#3b82f6' },
  processing: { label: 'Hazırlanır', color: '#8b5cf6' },
  shipped: { label: 'Göndərilib', color: '#14b8a6' },
  delivered: { label: 'Təhvil verilib', color: '#10b981' },
  cancelled: { label: 'Ləğv edilib', color: '#ef4444' },
};

export default function SalesDashboardPage() {
  const { activeTenantId } = useAuth();
  const { data, loading } = useSalesDashboard(activeTenantId, 30);

  if (loading && !data) return <DashboardState text="Satış göstəriciləri yüklənir..." />;
  if (!data) return <DashboardState text="Göstəriləcək satış məlumatı yoxdur." />;

  const statusData = Object.entries(data.status_breakdown || {}).map(([key, value]) => ({
    name: STATUS_META[key]?.label || key,
    value: Number(value || 0),
    color: STATUS_META[key]?.color || '#94a3b8',
  })).filter((item) => item.value > 0);
  const statusTotal = statusData.reduce((sum, item) => sum + item.value, 0);

  return (
    <main className="sales-analytics-page">
      <header className="sales-analytics-head">
        <div>
          <span className="sales-analytics-eyebrow"><BarChart3 size={15} /> Satış hesabatı</span>
          <h1>Satış analitikası</h1>
          <p>Satış məbləği, sifariş statusları və lider nəticələr vahid görünüşdə.</p>
        </div>
        <span className="sales-analytics-period">Son 30 gün</span>
      </header>

      <section className="sales-analytics-kpis" aria-label="Əsas satış göstəriciləri">
        <Kpi label="Dövriyyə" value={money(data.revenue)} icon={CircleDollarSign} tone="green" />
        <Kpi label="Sifariş sayı" value={data.orders_count || 0} icon={ShoppingCart} tone="blue" />
        <Kpi label="Açıq sifariş" value={data.open_orders || 0} icon={ReceiptText} tone="amber" />
        <Kpi label="Orta satış" value={money(data.avg_ticket)} icon={TrendingUp} tone="violet" />
      </section>

      <section className="sales-analytics-chart-grid">
        <Card title="Gündəlik satış dinamikası" subtitle="Son 30 gün üzrə satış məbləği">
          <div className="sales-analytics-chart">
            {(data.daily || []).length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7ece9" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#70827b' }} tickFormatter={(day) => day?.slice(5)} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#70827b' }} width={58} tickFormatter={(value) => Number(value).toLocaleString('az-AZ')} />
                  <Tooltip formatter={(value) => [money(value), 'Satış']} labelFormatter={(label) => `Tarix: ${label}`} contentStyle={{ borderRadius: 10, borderColor: '#dbe4df' }} />
                  <Line type="monotone" dataKey="amount" stroke="#0f9f75" strokeWidth={3} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyBlock text="Bu dövr üzrə satış yoxdur." />}
          </div>
        </Card>

        <Card title="Status paylanması" subtitle="Sifarişlərin cari vəziyyəti">
          {statusData.length ? (
            <div className="sales-status-layout">
              <div className="sales-status-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" outerRadius="88%" innerRadius="62%" paddingAngle={2} stroke="none">
                      {statusData.map((status) => <Cell key={status.name} fill={status.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ borderRadius: 10, borderColor: '#dbe4df' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="sales-status-total"><strong>{statusTotal}</strong><span>sifariş</span></div>
              </div>
              <div className="sales-status-legend">
                {statusData.map((status) => (
                  <div key={status.name}>
                    <span className="sales-status-dot" style={{ background: status.color }} />
                    <span>{status.name}</span>
                    <strong>{status.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyBlock text="Status məlumatı yoxdur." />}
        </Card>
      </section>

      <section className="sales-analytics-table-grid">
        <Card title="Top 5 müştəri" subtitle="Satış məbləğinə görə sıralama">
          <MiniTable
            rows={data.top_customers || []}
            columns={[
              { key: 'name', label: 'Müştəri' },
              { key: 'orders_count', label: 'Sifariş', align: 'right' },
              { key: 'amount', label: 'Məbləğ', align: 'right', format: money },
            ]}
          />
        </Card>
        <Card title="Top 5 məhsul" subtitle="Ən çox satılan məhsullar">
          <MiniTable
            rows={data.top_products || []}
            columns={[
              { key: 'name', label: 'Məhsul' },
              { key: 'qty', label: 'Miqdar', align: 'right', format: (value) => Number(value || 0).toLocaleString('az-AZ') },
              { key: 'amount', label: 'Məbləğ', align: 'right', format: money },
            ]}
          />
        </Card>
      </section>
    </main>
  );
}

function DashboardState({ text }) {
  return <div className="sales-analytics-state"><BarChart3 size={24} /><span>{text}</span></div>;
}

function Kpi({ label, value, icon: Icon, tone }) {
  return (
    <article className={`sales-analytics-kpi tone-${tone}`}>
      <div><span>{label}</span><strong>{value}</strong></div>
      <i><Icon size={21} /></i>
    </article>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <article className="sales-analytics-card">
      <header><h2>{title}</h2><p>{subtitle}</p></header>
      {children}
    </article>
  );
}

function EmptyBlock({ text }) {
  return <div className="sales-analytics-empty"><BarChart3 size={24} /><span>{text}</span></div>;
}

function MiniTable({ rows, columns }) {
  if (!rows.length) return <EmptyBlock text="Bu dövr üzrə məlumat yoxdur." />;
  const maxAmount = Math.max(...rows.map((row) => Number(row.amount || 0)), 1);

  return (
    <div className="sales-ranking-scroll">
      <table className="sales-ranking-table">
        <thead><tr><th aria-label="Sıra" />{columns.map((column) => <th key={column.key} className={column.align === 'right' ? 'is-right' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name || 'row'}-${index}`}>
              <td><span className="sales-rank-badge">{index + 1}</span></td>
              {columns.map((column) => (
                <td key={column.key} className={column.align === 'right' ? 'is-right' : ''}>
                  {column.key === 'name' ? (
                    <div className="sales-ranking-name">
                      <strong>{row[column.key] || 'Adsız'}</strong>
                      <span style={{ width: `${Math.max(5, (Number(row.amount || 0) / maxAmount) * 100)}%` }} />
                    </div>
                  ) : (column.format ? column.format(row[column.key]) : row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
