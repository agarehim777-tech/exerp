import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

const MOVEMENT_SELECT = '*, product:products(id,name,sku), warehouse:warehouses(id,name)';
const BALANCE_SELECT = '*, product:products(id,name,sku,unit,price), warehouse:warehouses(id,name,code)';
const DEFAULT_PAGE_SIZE = 50;
const normalizeMovement = (row) => {
  const movementType = row?.movement_type || row?.move_type || '';
  const isOut = ['delivery','transfer_out','write_off'].includes(movementType);
  return {
    ...row,
    move_type: row?.move_type || (isOut ? 'out' : 'in'),
    qty: row?.qty ?? row?.quantity ?? 0,
    moved_at: row?.moved_at || row?.created_at || null,
    reference: row?.reference || row?.reference_id || null,
    doc_no: row?.doc_no || row?.reference_type || null,
  };
};

export function useStock(tenantId, { movementsPageSize = DEFAULT_PAGE_SIZE } = {}) {
  const [warehouses, setWarehouses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movementsPage, setMovementsPage] = useState(0);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [degraded, setDegraded] = useState(null);

  const pageRef = useRef(0);
  pageRef.current = movementsPage;

  // --- Server-side paginated movements ---------------------------------
  const fetchMovements = useCallback(async (page = 0) => {
    if (!tenantId) return;
    setMovementsLoading(true);
    const from = page * movementsPageSize;
    const { data, error: err, count } = await supabase
      .from('stock_movements')
      .select(MOVEMENT_SELECT, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, from + movementsPageSize - 1);
    if (err) setError(err);
    setMovements((data || []).map(normalizeMovement));
    setMovementsTotal(count ?? 0);
    setMovementsLoading(false);
  }, [tenantId, movementsPageSize]);

  useEffect(() => { fetchMovements(movementsPage); }, [fetchMovements, movementsPage]);

  /** Dəyərləmə (FIFO/orta) üçün bütün hərəkətləri səhifələnmiş şəkildə yükləyir. */
  const fetchAllMovements = useCallback(async () => {
    if (!tenantId) return [];
    const chunk = 1000;
    const all = [];
    for (let offset = 0; ; offset += chunk) {
      const { data, error: err } = await supabase
        .from('stock_movements')
        .select(MOVEMENT_SELECT)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .range(offset, offset + chunk - 1);
      if (err) { setError(err); break; }
      all.push(...(data || []).map(normalizeMovement));
      if (!data || data.length < chunk) break;
    }
    return all;
  }, [tenantId]);

  // --- Warehouses + balances -------------------------------------------
  const fetchBase = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [wh, bal] = await Promise.all([
      supabase.from('warehouses').select('*').eq('tenant_id', tenantId).order('name'),
      supabase.from('stock_balances').select(BALANCE_SELECT).eq('tenant_id', tenantId),
    ]);
    const firstError = wh.error || bal.error;
    setError(firstError || null);
    setWarehouses(wh.data || []);
    setBalances(bal.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchBase(), fetchMovements(pageRef.current)]);
  }, [fetchBase, fetchMovements]);

  // --- Incremental realtime (fallback: tam refetch) ---------------------
  useEffect(() => {
    if (!tenantId) return undefined;
    const filter = `tenant_id=eq.${tenantId}`;
    const suffix = Math.random().toString(36).slice(2, 10);
    let disposed = false;
    let resyncTimer = null;

    /** İnkremental yeniləmə alınmayanda bütün datanı yenidən çəkir. */
    const fallbackResync = (reason) => {
      if (disposed || resyncTimer) return;
      setDegraded(reason || 'realtime');
      resyncTimer = setTimeout(async () => {
        resyncTimer = null;
        if (disposed) return;
        try {
          await Promise.all([fetchBase(), fetchMovements(pageRef.current)]);
          if (!disposed) setDegraded(null);
        } catch (err) {
          if (!disposed) setError(err);
        }
      }, 400);
    };

    const hydrateMovement = async (id) => {
      if (!id) return null;
      const { data, error: err } = await supabase
        .from('stock_movements').select(MOVEMENT_SELECT).eq('id', id).maybeSingle();
      if (err) throw err;
      return data ? normalizeMovement(data) : null;
    };
    const hydrateBalance = async (id) => {
      if (!id) return null;
      const { data, error: err } = await supabase
        .from('stock_balances').select(BALANCE_SELECT).eq('id', id).maybeSingle();
      if (err) throw err;
      return data || null;
    };

    const onMovement = async (payload) => {
      try {
        if (payload.eventType === 'DELETE') {
          const removedId = payload.old?.id;
          if (!removedId) { fallbackResync('movement-delete'); return; }
          setMovements((prev) => prev.filter((row) => row.id !== removedId));
          setMovementsTotal((prev) => Math.max(0, prev - 1));
          return;
        }
        const row = await hydrateMovement(payload.new?.id);
        if (!row) { fallbackResync('movement-hydrate'); return; }
        if (payload.eventType === 'INSERT') {
          setMovementsTotal((prev) => prev + 1);
          if (pageRef.current !== 0) return;
          setMovements((prev) => (prev.some((item) => item.id === row.id)
            ? prev
            : [row, ...prev].slice(0, movementsPageSize)));
          return;
        }
        setMovements((prev) => (prev.some((item) => item.id === row.id)
          ? prev.map((item) => (item.id === row.id ? row : item))
          : prev));
      } catch {
        fallbackResync('movement-error');
      }
    };

    const onBalance = async (payload) => {
      try {
        if (payload.eventType === 'DELETE') {
          const removedId = payload.old?.id;
          if (!removedId) { fallbackResync('balance-delete'); return; }
          setBalances((prev) => prev.filter((row) => row.id !== removedId));
          return;
        }
        const row = await hydrateBalance(payload.new?.id);
        if (!row) { fallbackResync('balance-hydrate'); return; }
        setBalances((prev) => (prev.some((item) => item.id === row.id)
          ? prev.map((item) => (item.id === row.id ? row : item))
          : [...prev, row]));
      } catch {
        fallbackResync('balance-error');
      }
    };

    const onWarehouse = (payload) => {
      try {
        if (payload.eventType === 'DELETE') {
          setWarehouses((prev) => prev.filter((row) => row.id !== payload.old?.id));
          return;
        }
        const row = payload.new;
        if (!row?.id) { fallbackResync('warehouse-payload'); return; }
        setWarehouses((prev) => {
          const next = prev.some((item) => item.id === row.id)
            ? prev.map((item) => (item.id === row.id ? { ...item, ...row } : item))
            : [...prev, row];
          return next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'az'));
        });
      } catch {
        fallbackResync('warehouse-error');
      }
    };

    const channel = supabase
      .channel(`stock:${tenantId}:${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter }, onMovement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_balances', filter }, onBalance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouses', filter }, onWarehouse)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          fallbackResync(`channel-${status.toLowerCase()}`);
        } else if (status === 'SUBSCRIBED') {
          // Bağlantı bərpa olunanda mümkün itmiş event-lər üçün tam sinxronizasiya.
          fallbackResync('channel-resubscribed');
        }
      });

    // Tab yenidən aktivləşəndə / şəbəkə qayıdanda da tam sinxronizasiya.
    const onWake = () => {
      if (document.visibilityState === 'visible') fallbackResync('wake');
    };
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      disposed = true;
      if (resyncTimer) clearTimeout(resyncTimer);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
      supabase.removeChannel(channel);
    };
  }, [tenantId, movementsPageSize, fetchBase, fetchMovements]);

  // --- Mutations --------------------------------------------------------
  const createWarehouse = async (payload) => {
    const { error: err } = await supabase.from('warehouses').insert({ ...payload, tenant_id: tenantId });
    if (err) throw err;
    await fetchBase();
  };

  const updateWarehouse = async (id, payload) => {
    const { error: err } = await supabase
      .from('warehouses')
      .update({
        code: payload.code,
        name: payload.name,
        address: payload.address || null,
        is_active: payload.is_active !== false,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (err) throw err;
    await fetchBase();
  };

  const removeWarehouse = async (id) => {
    const { error: err } = await supabase.from('warehouses').delete().eq('id', id);
    if (err) throw err;
    await fetchBase();
  };

  const addMovement = async (payload) => {
    const { error: err } = await supabase.from('stock_movements').insert({
      ...payload,
      qty: Number(payload.qty) || 0,
      unit_cost: Number(payload.unit_cost) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    if (pageRef.current !== 0) setMovementsPage(0);
    else await fetchMovements(0);
  };

  const transferStock = async ({ fromWarehouseId, toWarehouseId, productId, qty, note }) => {
    const amount = Number(qty);
    if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
      throw new Error('Fərqli mənbə və hədəf anbar seçin.');
    }
    if (!productId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Məhsul və düzgün miqdar seçin.');
    }

    const source = balances.find(
      (row) => row.warehouse_id === fromWarehouseId && row.product_id === productId,
    );
    if (!source || Number(source.qty || 0) < amount) {
      throw new Error(`Mənbə anbarda yalnız ${Number(source?.qty || 0).toLocaleString('az-AZ')} ədəd mövcuddur.`);
    }

    const reference = `TR-${Date.now()}`;
    const product = source.product || {};
    const common = {
      tenant_id: tenantId,
      product_id: productId,
      sku: product.sku || source.sku || null,
      qty: amount,
      unit_cost: Number(source.avg_cost || 0),
      doc_no: reference,
      reference,
      note: note || 'Daxili anbar transferi',
    };
    const { error: err } = await supabase.from('stock_movements').insert([
      { ...common, warehouse_id: fromWarehouseId, move_type: 'out' },
      { ...common, warehouse_id: toWarehouseId, move_type: 'in' },
    ]);
    if (err) throw err;
    await refresh();
    return reference;
  };

  const setReorderPoint = async (balanceId, value) => {
    const { error: err } = await supabase
      .from('stock_balances')
      .update({ reorder_point: Number(value) || 0 })
      .eq('id', balanceId);
    if (err) throw err;
  };

  return {
    warehouses,
    balances,
    movements,
    movementsPage,
    movementsPageSize,
    movementsTotal,
    movementsPageCount: Math.max(1, Math.ceil(movementsTotal / movementsPageSize)),
    movementsLoading,
    degraded,
    setMovementsPage,
    fetchAllMovements,
    loading,
    error,
    refresh,
    createWarehouse,
    updateWarehouse,
    removeWarehouse,
    addMovement,
    transferStock,
    setReorderPoint,
  };
}
