import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useQuotes } from '../../shared/hooks/useQuotes.js';
import { useCustomers } from '../../shared/hooks/useCustomers.js';
import { useProducts } from '../../shared/hooks/useProducts.js';
import StatusBadge from './StatusBadge.jsx';
import QuoteEditor from './QuoteEditor.jsx';

export default function QuotesPage() {
  const { activeTenantId } = useAuth();
  const { quotes, create, update, setStatus, remove, convertToOrder } = useQuotes(activeTenantId);
  const { customers } = useCustomers(activeTenantId);
  const { products } = useProducts(activeTenantId);
  const [editing, setEditing] = useState(null); // null | 'new' | quote object
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = quotes.filter(x =>
    (filter === 'all' || x.status === filter) &&
    (!q || x.number?.toLowerCase().includes(q.toLowerCase()) || x.customer?.name?.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <option value="all">Bütün statuslar</option>
          <option value="draft">Layihə</option>
          <option value="sent">Göndərilib</option>
          <option value="accepted">Qəbul edildi</option>
          <option value="rejected">Rədd edildi</option>
          <option value="expired">Vaxtı bitib</option>
        </select>
        <button onClick={() => setEditing('new')}
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '9px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>+ Yeni kotirovka</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <Th>Nömrə</Th><Th>Müştəri</Th><Th align="right">Cəm</Th><Th>Status</Th><Th>Etibarlıdır</Th><Th>Yaradılıb</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => setEditing(r)}
                style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td><b>{r.number}</b></Td>
                <Td>{r.customer?.name || '—'}</Td>
                <Td align="right"><b>{Number(r.total).toFixed(2)} {r.currency}</b></Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td>{r.valid_until ? new Date(r.valid_until).toLocaleDateString('az-AZ') : '—'}</Td>
                <Td>{new Date(r.created_at).toLocaleDateString('az-AZ')}</Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Kotirovka yoxdur — yenisini yaradın</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <QuoteEditor
          quote={editing === 'new' ? null : editing}
          customers={customers} products={products}
          onClose={() => setEditing(null)}
          onCreate={async (v) => { await create(v); setEditing(null); }}
          onUpdate={async (id, v) => { await update(id, v); setEditing(null); }}
          onSetStatus={setStatus}
          onDelete={async (id) => { if (confirm('Silinsin?')) { await remove(id); setEditing(null); } }}
          onConvert={async (id) => {
            await convertToOrder(id);
            alert('Kotirovka sifarişə çevrildi ✓');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
const Th = ({ children, align }) => <th style={{ padding: '10px 12px', textAlign: align || 'left', color: '#64748b', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
const Td = ({ children, align }) => <td style={{ padding: '10px 12px', textAlign: align || 'left' }}>{children}</td>;
