import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { usePermissions } from '../../shared/hooks/usePermissions.js';
import { createIdempotencyKey } from '../../services/coreOperations.js';
import './production.css';

export default function ProductionLedgerPage() {
  const { activeTenantId: tenantId } = useAuth();
  const { canEdit } = usePermissions();
  const [products, setProducts] = useState([]), [warehouses, setWarehouses] = useState([]), [batches, setBatches] = useState([]);
  const [draft, setDraft] = useState({ product_id: '', warehouse_id: '', quantity: 1 });
  const [materials, setMaterials] = useState([{ product_id: '', quantity: 1 }]);
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const generation = useRef(0), attempt = useRef(null), inFlight = useRef(false);
  const currentTenant = useRef(tenantId);
  currentTenant.current = tenantId;
  const editable = canEdit('production') && canEdit('warehouse');
  const load = useCallback(async () => {
    if (tenantId !== currentTenant.current) return;
    const version = ++generation.current;
    if (!tenantId) { setProducts([]); setWarehouses([]); setBatches([]); return; }
    const responses = await Promise.all([
      supabase.from('products').select('id,name,sku').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      supabase.from('warehouses').select('id,name').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('production_batches').select('*').eq('tenant_id', tenantId).order('completed_at', { ascending: false }).limit(100),
    ]);
    if (version !== generation.current || tenantId !== currentTenant.current) return;
    const failure = responses.find(response => response.error)?.error;
    if (failure) { setError(failure.message); return; }
    setProducts(responses[0].data); setWarehouses(responses[1].data); setBatches(responses[2].data);
  }, [tenantId]);
  useEffect(() => {
    setProducts([]); setWarehouses([]); setBatches([]); setError('');
    setDraft({ product_id: '', warehouse_id: '', quantity: 1 });
    setMaterials([{ product_id: '', quantity: 1 }]); attempt.current = null;
    load(); return () => { generation.current += 1; };
  }, [load]);
  async function post(event) {
    event.preventDefault();
    if (!editable || !tenantId || inFlight.current) return;
    const payload = { ...draft, quantity: Number(draft.quantity), materials: materials.map(row => ({ ...row, quantity: Number(row.quantity) })) };
    const signature = JSON.stringify([tenantId, payload]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: createIdempotencyKey('production') };
    inFlight.current = true; setPending(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('post_material_production', {
        _tenant_id: tenantId, _request_key: attempt.current.key, _payload: payload,
      });
      if (failure) throw failure;
      if (tenantId !== currentTenant.current) return;
      attempt.current = null;
      await load();
    } catch (failure) { if (tenantId === currentTenant.current) setError(failure.message); }
    finally { inFlight.current = false; setPending(false); }
  }
  const selectProduct = (value, change, material = false) => <select aria-label={material ? 'Xammal' : 'Hazır məhsul'} required
    value={value} disabled={pending || !editable} onChange={event => change(event.target.value)}>
    <option value="">Məhsul seçin</option>
    {products.filter(product => !material || product.id !== draft.product_id).map(product =>
      <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
  </select>;
  return <div className="stack production-ledger">
    {error && <p role="alert" className="inline-alert danger">{error}</p>}
    <form onSubmit={post} className="production-command" data-testid="production-command">
      <div className="production-fields">
        <label>Hazır məhsul{selectProduct(draft.product_id, product_id => setDraft({ ...draft, product_id }))}</label>
        <label>Anbar<select aria-label="Anbar" required value={draft.warehouse_id} disabled={pending || !editable}
          onChange={event => setDraft({ ...draft, warehouse_id: event.target.value })}>
          <option value="">Anbar seçin</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select></label>
        <label>Hazır məhsul miqdarı<input aria-label="Hazır məhsul miqdarı" required type="number" step="0.001" min="0.001"
          value={draft.quantity} disabled={pending || !editable} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label>
      </div>
      <h3>BOM / Xammal sərfi</h3>
      {materials.map((row, index) => <div className="production-material" key={index}>
        {selectProduct(row.product_id, product_id => setMaterials(materials.map((item, i) => i === index ? { ...item, product_id } : item)), true)}
        <input aria-label="Xammal miqdarı" required type="number" min="0.001" step="0.001" value={row.quantity}
          disabled={pending || !editable} onChange={event => setMaterials(materials.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} />
        <button type="button" className="icon-btn" title="Xammalı çıxar" aria-label="Xammalı çıxar" disabled={pending || !editable || materials.length === 1}
          onClick={() => setMaterials(materials.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
      </div>)}
      <div className="production-actions">
        <button type="button" className="secondary-btn" disabled={pending || !editable || materials.length >= 100}
          onClick={() => setMaterials([...materials, { product_id: '', quantity: 1 }])}><Plus size={16} /> Xammal</button>
        <button type="submit" className="primary-btn" disabled={pending || !editable}>{pending ? 'Qeydə alınır...' : 'İstehsalı tamamla'}</button>
      </div>
    </form>
    <section className="production-register">
      <div className="production-actions"><h3>İstehsal reyestri</h3><button className="icon-btn" title="Yenilə" aria-label="Yenilə" onClick={load}><RefreshCw size={16} /></button></div>
      <div className="table-scroll"><table><thead><tr><th>Partiya</th><th>Məhsul</th><th>Miqdar</th><th>Material mayası</th><th>Vahid maya</th><th>Tarix</th></tr></thead>
        <tbody>{batches.map(batch => <tr key={batch.id} data-batch-id={batch.id}>
          <td>{batch.batch_no}</td><td>{products.find(product => product.id === batch.product_id)?.name || batch.product_id}</td>
          <td className="numeric">{Number(batch.quantity)}</td><td className="numeric">{Number(batch.total_cost).toFixed(2)}</td>
          <td className="numeric">{Number(batch.unit_cost).toFixed(6)}</td><td>{new Date(batch.completed_at).toLocaleDateString('az-AZ')}</td>
        </tr>)}</tbody></table></div>
    </section>
  </div>;
}
