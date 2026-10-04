import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck, Send } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { usePermissions } from '../../shared/hooks/usePermissions.js';
import { supabase } from '../../integrations/supabase/client';
import { createIdempotencyKey } from '../../services/coreOperations.js';

export default function IntegrationLedgerPage() {
  const { activeTenantId: tenantId } = useAuth(); const { canEdit } = usePermissions();
  const [endpoints, setEndpoints] = useState([]), [dispatches, setDispatches] = useState([]);
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const attempt = useRef(null), generation = useRef(0), inFlight = useRef(false);
  const currentTenant = useRef(tenantId);
  currentTenant.current = tenantId;
  const load = useCallback(async () => {
    if (tenantId !== currentTenant.current) return;
    const version = ++generation.current;
    if (!tenantId) { setEndpoints([]); setDispatches([]); return; }
    const responses = await Promise.all([
      supabase.from('webhook_endpoints').select('id,name,key_version').eq('tenant_id', tenantId),
      supabase.from('webhook_dispatches').select('id,status,response_code,latency_ms,attempts,error_code,created_at')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (version !== generation.current || tenantId !== currentTenant.current) return;
    const failure = responses.find(response => response.error)?.error;
    if (failure) { setError(failure.message); return; }
    setEndpoints(responses[0].data); setDispatches(responses[1].data);
  }, [tenantId]);
  useEffect(() => { setEndpoints([]); setDispatches([]); setError(''); attempt.current = null; load();
    return () => { generation.current += 1; }; }, [load]);
  async function dispatch() {
    if (!tenantId || !canEdit('api') || inFlight.current) return;
    attempt.current ||= createIdempotencyKey('webhook'); inFlight.current = true; setPending(true); setError('');
    try {
      const response = await supabase.functions.invoke('webhook-dispatch', { body: { tenant_id: tenantId, request_key: attempt.current } });
      if (response.error) throw response.error;
      if (!response.data?.delivered) throw new Error('HTTP qəbul qəbzi təsdiqlənmədi.');
      if (tenantId === currentTenant.current) attempt.current = null;
    } catch (failure) { if (tenantId === currentTenant.current) setError(failure.message); }
    finally { await load(); inFlight.current = false; setPending(false); }
  }
  async function rotate(endpoint) {
    if (!tenantId || inFlight.current || !canEdit('api')) return;
    inFlight.current = true; setPending(true); setError('');
    try {
      const response = await supabase.rpc('rotate_webhook_audit_key', { _tenant_id: tenantId, _endpoint_id: endpoint.id });
      if (response.error) throw response.error;
      await load();
    } catch (failure) { if (tenantId === currentTenant.current) setError(failure.message); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <div className="stack">
    {error && <p className="inline-alert danger" role="alert">{error}</p>}
    <div className="toolbar">
      <button className="primary-btn" disabled={pending || !canEdit('api')} onClick={dispatch} data-testid="webhook-http-test">
        <Send size={16} /> {pending ? 'Göndərilir...' : 'ERP HTTP bağlantısını yoxla'}</button>
      <button className="icon-btn" title="Yenilə" aria-label="Yenilə" onClick={load}><RefreshCw size={16} /></button>
    </div>
    <section><h3>İmzalama açarları</h3>{endpoints.map(endpoint => <div className="toolbar" key={endpoint.id}>
      <strong>{endpoint.name} · v{endpoint.key_version}</strong>
      <button className="secondary-btn" disabled={pending || !canEdit('api')} onClick={() => rotate(endpoint)}><ShieldCheck size={16} /> Açarı yenilə</button>
    </div>)}</section>
    <section><h3>HTTP göndəriş reyestri</h3><div className="table-scroll"><table data-testid="webhook-dispatch-register">
      <thead><tr><th>Göndəriş</th><th>Status</th><th>HTTP</th><th>Müddət</th><th>Cəhd</th><th>Xəta</th></tr></thead>
      <tbody>{dispatches.map(item => <tr key={item.id} data-dispatch-id={item.id}>
        <td>{item.id}</td><td>{item.status}</td><td>{item.response_code ?? '-'}</td><td>{item.latency_ms ?? '-'} ms</td>
        <td>{item.attempts}</td><td>{item.error_code || '-'}</td>
      </tr>)}</tbody>
    </table></div></section>
  </div>;
}
