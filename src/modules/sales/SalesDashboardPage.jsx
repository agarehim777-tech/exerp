import React from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSalesDashboard } from '../../shared/hooks/useSalesDashboard.js';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

const money = (v) => `${Number(v || 0).toLocaleString('az-AZ', { maximumFractionDigits: 0 })} ₼`;
const STATUS_COLORS = { draft: '#94a3b8', pending: '#f59e0b', confirmed: '#3b82f6', processing: '#8b5cf6', shipped: '#14b8a6', delivered: '#10b981', cancelled: '#ef4444' };

export default function SalesDashboardPage() {
  const { activeTenantId } = useAuth();
  const { data, loading } = useSalesDashboard(activeTenantId, 30);

  if (loading && !data) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Yüklənir...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Data yoxdur</div>;

  const statusData = Object.entries(data.status_breakdown || {}).map(([k, v]) => ({ name: k, value: v, color: STATUS_COLORS[k] || '#94a3b8' }));

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12 }}>
        <Kpi label="Dövriyyə (30g)" value={money(data.revenue)} accent="#10b981" />
        <Kpi label="Sifariş sayı" value={data.orders_count} accent="#3b82f6" />
        <Kpi label="Açıq sifariş" value={data.open_orders} accent="#f59e0b" />
        <Kpi label="Orta çek" value={money(data.avg_ticket)} accent="#8b5cf6" />
        <Kpi label="Açıq kotirovka" value={data.quotes_open} accent="#06b6d4" />
        <Kpi label="Qazanılan kotirovka" value={money(data.quotes_won_amount)} accent="#059669" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card title="Gündəlik satış (son 30 gün)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.daily || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Status paylanması">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Data yoxdur</div>}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Top 5 müştəri">
          <MiniTable rows={data.top_customers || []} cols={[
            { key: 'name', label: 'Müştəri' },
            { key: 'orders_count', label: 'Sifariş', align: 'right' },
            { key: 'amount', label: 'Cəm', align: 'right', format: money },
          ]} />
        </Card>
        <Card title="Top 5 məhsul">
          <MiniTable rows={data.top_products || []} cols={[
            { key: 'name', label: 'Məhsul' },
            { key: 'qty', label: 'Miq.', align: 'right', format: v => Number(v).toFixed(0) },
            { key: 'amount', label: 'Cəm', align: 'right', format: money },
          ]} />
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}
function MiniTable({ rows, cols }) {
  if (!rows.length) return <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Yoxdur</div>;
  return (
    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
      <thead><tr>{cols.map(c => <th key={c.key} style={{ textAlign: c.align || 'left', padding: '6px 4px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{cols.map(c => (
          <td key={c.key} style={{ textAlign: c.align || 'left', padding: '8px 4px', borderBottom: '1px solid #f1f5f9' }}>
            {c.format ? c.format(r[c.key]) : r[c.key]}
          </td>
        ))}</tr>)}
      </tbody>
    </table>
  );
}
