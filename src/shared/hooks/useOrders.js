import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';

const mainCashCode = tenantId => `MAIN-${String(tenantId || '').slice(0, 8).toUpperCase()}`;

function isMissingRpc(error) {
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || /function .* does not exist|schema cache/i.test(error?.message || '');
}

function lineValues(item, index, tenantId, orderId) {
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const discount = Number(item.discount_pct) || 0;
  const vatRate = Number(item.vat_rate) || 0;
  const net = qty * unitPrice * (1 - discount / 100);
  return {
    tenant_id: tenantId,
    order_id: orderId,
    product_id: item.product_id || null,
    line_no: item.line_no || index + 1,
    description: item.description || null,
    qty,
    unit_price: unitPrice,
    discount_pct: discount,
    vat_rate: vatRate,
    line_total: Number((net * (1 + vatRate / 100)).toFixed(2)),
  };
}

const ORDERS_PAGE_SIZE = 200;

export function useOrders(tenantId) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(ORDERS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const reconciliationKeyRef = useRef('');

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(id,name), items:order_items(*)')
      .eq('tenant_id', tenantId)
      .order('order_date', { ascending: false })
      .limit(limit + 1);
    if (error) setError(error);
    else {
      const rows = data || [];
      const visibleRows = rows.slice(0, limit);
      const orderIds = visibleRows.map((row) => row.id).filter(Boolean);
      let creditsByOrder = new Map();
      let bonusesByOrder = new Map();
      if (orderIds.length) {
        const [creditResult, bonusResult] = await Promise.all([
          supabase.from('credit_contracts')
            .select('id,order_id,contract_no,principal,initial_payment,required_initial,term_months,start_date,status,created_at')
            .eq('tenant_id', tenantId).in('order_id', orderIds),
          supabase.from('order_bonus_assignments')
            .select('id,order_id,seller_name,rate,position,effective_from,effective_to')
            .eq('tenant_id', tenantId).in('order_id', orderIds)
            .is('effective_to', null)
            .order('effective_from', { ascending: false })
            .order('position', { ascending: true })
            .order('created_at', { ascending: true }),
        ]);
        const { data: credits, error: creditError } = creditResult;
        if (creditError) setError(creditError);
        else creditsByOrder = new Map((credits || []).map((credit) => [credit.order_id, credit]));
        if (bonusResult.error) setError(bonusResult.error);
        else {
          for (const bonus of bonusResult.data || []) {
            const rows = bonusesByOrder.get(bonus.order_id) || [];
            rows.push(bonus);
            bonusesByOrder.set(bonus.order_id, rows);
          }
        }
      }
      setHasMore(rows.length > limit);
      setOrders(visibleRows.map((row) => ({
        ...row,
        credit: creditsByOrder.get(row.id) || null,
        bonus_assignments: bonusesByOrder.get(row.id) || [],
      })));
    }
    setLoading(false);
  }, [tenantId, limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + ORDERS_PAGE_SIZE), []);

  useRealtimeResync(tenantId, ['orders', 'order_items'], fetchAll, { channelPrefix: 'orders' });

  const registerInitialPayment = async (orderId, amount, currency = 'AZN') => {
    const expected = Number(amount || 0);
    if (!orderId || !Number.isFinite(expected) || expected <= 0) return;
    const { data: order, error: orderError } = await supabase.from('orders')
      .select('id,paid_amount').eq('id', orderId).eq('tenant_id', tenantId).single();
    if (orderError) throw orderError;
    const missingAmount = Number((expected - Number(order.paid_amount || 0)).toFixed(2));
    if (missingAmount <= 0) return;

    const code = mainCashCode(tenantId);
    let { data: account, error: accountError } = await supabase.from('cash_accounts')
      .select('id').eq('tenant_id', tenantId).eq('account_no', code).eq('is_active', true)
      .limit(1).maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      const byName = await supabase.from('cash_accounts')
        .select('id').eq('tenant_id', tenantId).ilike('name', 'Əsas kassa')
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (byName.error) throw byName.error;
      account = byName.data;
    }
    if (!account) {
      const { data: inactiveAccount, error: inactiveError } = await supabase.from('cash_accounts')
        .select('id').eq('tenant_id', tenantId).eq('account_no', code).maybeSingle();
      if (inactiveError) throw inactiveError;
      if (inactiveAccount) {
        const { data: reactivated, error: reactivateError } = await supabase.from('cash_accounts')
          .update({ is_active: true, name: 'Əsas kassa', type: 'cash', currency })
          .eq('id', inactiveAccount.id).eq('tenant_id', tenantId).select('id').single();
        if (reactivateError) throw reactivateError;
        account = reactivated;
      } else {
        const { data: createdAccount, error: createAccountError } = await supabase.from('cash_accounts').insert({
          tenant_id: tenantId, account_no: code, name: 'Əsas kassa', type: 'cash', currency, opening_balance: 0, is_active: true,
        }).select('id').single();
        if (createAccountError) throw createAccountError;
        account = createdAccount;
      }
    }
    const { error: paymentError } = await supabase.rpc('register_order_payment', {
      _order_id: orderId,
      _amount: missingAmount,
      _account_id: account.id,
    });
    if (paymentError) throw paymentError;
  };

  const createCreditForOrder = async (orderId, credit) => {
    if (!credit || !orderId) return null;
    const { data: existing, error: existingError } = await supabase.from('credit_contracts')
      .select('id').eq('tenant_id', tenantId).eq('order_id', orderId).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing.id;
    const { data: creditId, error: creditError } = await supabase.rpc('create_credit_contract', {
      _tenant_id: tenantId,
      _contract_no: credit.contract_no,
      _customer_id: credit.customer_id,
      _order_id: orderId,
      _principal: Number(credit.principal || 0),
      _initial_payment: Number(credit.initial_payment || 0),
      _term_months: Number(credit.term_months || 12),
      _start_date: credit.start_date || new Date().toISOString().slice(0, 10),
    });
    if (creditError) throw creditError;
    return creditId;
  };

  const saveBonusAssignments = async (orderId, effectiveFrom, allocations = [], reason = null) => {
    const normalized = allocations
      .map((row) => ({ seller_name: String(row?.seller_name || row?.seller || '').trim(), rate: Number(row?.rate ?? row?.bonus ?? 0) }))
      .filter((row) => row.seller_name && row.rate > 0);
    if (!orderId || !normalized.length) return;
    const { error: bonusError } = await supabase.rpc('set_order_bonus_assignments', {
      _order_id: orderId,
      _effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
      _allocations: normalized,
      _reason: reason || 'Sifariş yaradılarkən təyin edilib',
    });
    if (bonusError) throw bonusError;
  };

  useEffect(() => {
    if (!tenantId || loading || !orders.length) return;
    const reconciliationKey = `${tenantId}:${orders.map((order) => `${order.id}:${Number(order.paid_amount || 0)}`).sort().join('|')}`;
    if (reconciliationKeyRef.current === reconciliationKey) return;
    reconciliationKeyRef.current = reconciliationKey;
    let active = true;
    (async () => {
      const orderIds = orders.map((order) => order.id).filter(Boolean);
      const { data: contracts, error: contractError } = await supabase.from('credit_contracts')
        .select('order_id,initial_payment').eq('tenant_id', tenantId).in('order_id', orderIds).gt('initial_payment', 0);
      if (contractError) throw contractError;
      let changed = false;
      for (const contract of contracts || []) {
        const order = orders.find((row) => row.id === contract.order_id);
        if (!order || Number(order.paid_amount || 0) >= Number(contract.initial_payment || 0)) continue;
        await registerInitialPayment(order.id, contract.initial_payment, order.currency || 'AZN');
        changed = true;
      }
      if (active && changed) await fetchAll();
    })().catch((reconcileError) => {
      if (active) {
        reconciliationKeyRef.current = '';
        setError(reconcileError);
      }
    });
    return () => { active = false; };
    // Mövcud natamam sifarişlər tenant üzrə yalnız bir dəfə sinxronlaşdırılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, loading, orders]);

  const create = async ({ items = [], request_key: requestKey, credit = null, bonus_allocations: bonusAllocations = [], ...header }) => {
    if (requestKey && header.customer_id) {
      const { data: atomicResult, error: atomicError } = await supabase.rpc('create_sales_order_atomic', {
        _tenant_id: tenantId,
        _request_key: requestKey,
        _order_no: header.order_no,
        _customer_id: header.customer_id,
        _order_date: header.order_date || new Date().toISOString().slice(0, 10),
        _currency: header.currency || 'AZN',
        _notes: header.notes || null,
        _items: items,
        _credit: credit,
      });
      if (!atomicError) {
        await saveBonusAssignments(atomicResult.order_id, header.order_date, bonusAllocations);
        await registerInitialPayment(atomicResult.order_id, credit?.initial_payment, header.currency || 'AZN');
        await fetchAll();
        return { id: atomicResult.order_id, creditId: atomicResult.credit_id };
      }
      if (!isMissingRpc(atomicError)) throw atomicError;
    }

    const { data: orderId, error } = await supabase.rpc('create_sales_order', {
      _tenant_id: tenantId,
      _order_no: header.order_no,
      _customer_id: header.customer_id || null,
      _order_date: header.order_date || new Date().toISOString().slice(0, 10),
      _currency: header.currency || 'AZN',
      _notes: header.notes || null,
      _items: items,
    });
    if (!error) {
      const creditId = await createCreditForOrder(orderId, credit ? { ...credit, customer_id: header.customer_id } : null);
      await saveBonusAssignments(orderId, header.order_date, bonusAllocations);
      await registerInitialPayment(orderId, credit?.initial_payment, header.currency || 'AZN');
      await fetchAll();
      return { id: orderId, creditId };
    }
    if (!isMissingRpc(error)) throw error;

    // Transitional path for environments where the core-operations migration
    // has not been deployed yet. Remove after all environments report v2.
    const rows = items.map((item, index) => lineValues(item, index, tenantId, null));
    const subtotal = rows.reduce((sum, item) => {
      const net = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      return sum + net;
    }, 0);
    const vatTotal = rows.reduce((sum, item) => {
      const net = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      return sum + net * item.vat_rate / 100;
    }, 0);
    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        ...header,
        status: header.status || 'confirmed',
        subtotal: Number(subtotal.toFixed(2)),
        vat_total: Number(vatTotal.toFixed(2)),
        total: Number((subtotal + vatTotal).toFixed(2)),
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    const fallbackRows = items.map((item, index) => lineValues(item, index, tenantId, order.id));
    const { error: itemError } = await supabase.from('order_items').insert(fallbackRows);
    if (itemError) {
      await supabase.from('orders').delete().eq('id', order.id).eq('tenant_id', tenantId);
      throw itemError;
    }
    const creditId = await createCreditForOrder(order.id, credit ? { ...credit, customer_id: header.customer_id } : null);
    await saveBonusAssignments(order.id, header.order_date, bonusAllocations);
    await registerInitialPayment(order.id, credit?.initial_payment, header.currency || 'AZN');
    await fetchAll();
    return { ...order, creditId };
  };

  const updateStatus = async (id, status) => {
    // Intermediate workflow steps only change the order header. Running the
    // accounting RPC for these steps made "Hazırlamağa başla" depend on
    // finance/inventory permissions even though no accounting event occurs.
    if (['draft', 'pending', 'confirmed', 'processing', 'shipped'].includes(status)) {
      const { data, error } = await supabase.from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Sifariş tapılmadı və ya statusu dəyişmək icazəniz yoxdur.');
      await fetchAll();
      return;
    }
    const { error } = await supabase.rpc('process_sales_order_status', { _order_id: id, _status: status });
    if (error) {
      if (!isMissingRpc(error)) throw error;
      const { error: fallbackError } = await supabase.from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id).eq('tenant_id', tenantId);
      if (fallbackError) throw fallbackError;
    }
    await fetchAll();
  };

  const updateHeader = async (id, patch) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const registerPayment = async (order, amount, accountId) => {
    const payment = Number(amount);
    const total = Number(order?.total || 0);
    const alreadyPaid = Number(order?.paid_amount || 0);
    const outstanding = Math.max(0, total - alreadyPaid);
    if (!order?.id) throw new Error('Sifariş tapılmadı.');
    if (!Number.isFinite(payment) || payment <= 0) throw new Error('Düzgün ödəniş məbləği daxil edin.');
    if (payment > outstanding) throw new Error(`Ödəniş qalıq borcdan (${outstanding.toFixed(2)} ${order.currency || 'AZN'}) çox ola bilməz.`);

    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const { data: existingAccount, error: accountError } = await supabase.from('cash_accounts')
        .select('id').eq('tenant_id', tenantId).eq('currency', order.currency || 'AZN').eq('is_active', true).limit(1).maybeSingle();
      if (accountError) throw accountError;
      if (existingAccount) resolvedAccountId = existingAccount.id;
      else {
        const code = mainCashCode(tenantId);
        const { data: inactiveAccount, error: inactiveError } = await supabase.from('cash_accounts')
          .select('id').eq('tenant_id', tenantId).eq('account_no', code).limit(1).maybeSingle();
        if (inactiveError) throw inactiveError;
        if (inactiveAccount) {
          const { data: reactivated, error: reactivateError } = await supabase.from('cash_accounts')
            .update({ is_active: true, name: 'Əsas kassa', type: 'cash', currency: order.currency || 'AZN' })
            .eq('id', inactiveAccount.id).eq('tenant_id', tenantId).select('id').single();
          if (reactivateError) throw reactivateError;
          resolvedAccountId = reactivated.id;
        } else {
          const { data: createdAccount, error: createAccountError } = await supabase.from('cash_accounts').insert({
            tenant_id: tenantId, account_no: code, name: 'Əsas kassa', type: 'cash', currency: order.currency || 'AZN', opening_balance: 0, is_active: true,
          }).select('id').single();
          if (createAccountError) throw createAccountError;
          resolvedAccountId = createdAccount.id;
        }
      }
    }

    const { error: paymentError } = await supabase.rpc('register_order_payment', {
      _order_id: order.id,
      _amount: payment,
      _account_id: resolvedAccountId,
    });
    if (paymentError) throw paymentError;
    /*const { data: transaction, error: cashError } = await supabase.from('cash_transactions').insert({
      tenant_id: tenantId,
      account_id: resolvedAccountId,
      direction: 'in',
      amount: payment,
      currency: order.currency || 'AZN',
      category: 'sales_payment',
      counterparty: order.customer?.name || null,
      customer_id: order.customer_id || order.customer?.id || null,
      reference: order.order_no,
      description: `${order.order_no} sifarişi üzrə müştəri ödənişi`,
      occurred_at: new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (cashError) throw cashError;

    const newPaid = Number((alreadyPaid + payment).toFixed(2));
    const { error: orderError } = await supabase.from('orders').update({
      paid_amount: newPaid,
      payment_status: newPaid >= total ? 'paid' : 'partial',
    }).eq('id', order.id).eq('tenant_id', tenantId);
    if (orderError) {
      await supabase.from('cash_transactions').delete().eq('id', transaction.id).eq('tenant_id', tenantId);
      throw orderError;
    }*/
    await fetchAll();
  };

  const update = async (id, { items = [], ...header }) => {
    const rows = items.map((item, index) => lineValues(item, index, tenantId, id));
    const subtotal = rows.reduce((sum, item) => sum + item.qty * item.unit_price * (1 - item.discount_pct / 100), 0);
    const vatTotal = rows.reduce((sum, item) => {
      const net = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      return sum + net * item.vat_rate / 100;
    }, 0);
    const { error: headerError } = await supabase.from('orders').update({
      ...header,
      subtotal: Number(subtotal.toFixed(2)),
      vat_total: Number(vatTotal.toFixed(2)),
      total: Number((subtotal + vatTotal).toFixed(2)),
    }).eq('id', id).eq('tenant_id', tenantId);
    if (headerError) throw headerError;
    const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', id).eq('tenant_id', tenantId);
    if (deleteError) throw deleteError;
    if (rows.length) {
      const { error: itemError } = await supabase.from('order_items').insert(rows);
      if (itemError) throw itemError;
    }
    await fetchAll();
  };

  const remove = async (id) => {
    const { error: rpcError } = await supabase.rpc('delete_sales_order_safe', { _order_id: id });
    if (rpcError && !isMissingRpc(rpcError)) throw rpcError;
    if (rpcError && isMissingRpc(rpcError)) {
      // Keçid dövrü: migration tətbiq edilməyən bazalarda yalnız təhlükəsiz,
      // silinə bilən asılılıqları ardıcıllıqla təmizlə.
      // order_items və order_bonus_assignments orders FK-si ilə ON DELETE
      // CASCADE-dır. Onları birbaşa silmək lazım deyil (bonus cədvəli üçün
      // authenticated rola qəsdən DELETE grant verilmir). Yalnız RESTRICT
      // əlaqəli, ödənişsiz kredit müqaviləsini əvvəl təmizləyirik.
      const { data: reservations, error: reservationReadError } = await supabase
        .from('stock_reservations').select('*').eq('order_id', id).eq('tenant_id', tenantId);
      if (reservationReadError && !/does not exist|schema cache/i.test(reservationReadError.message || '')) throw reservationReadError;
      if ((reservations || []).some((row) => row.status === 'fulfilled')) {
        throw new Error('Anbardan çıxışı tamamlanmış sifariş silinə bilməz.');
      }
      for (const reservation of (reservations || []).filter((row) => row.status === 'active')) {
        const { data: balance, error: balanceReadError } = await supabase.from('stock_balances')
          .select('reserved').eq('tenant_id', tenantId).eq('warehouse_id', reservation.warehouse_id)
          .eq('product_id', reservation.product_id).maybeSingle();
        if (balanceReadError) throw balanceReadError;
        const nextReserved = Number(balance?.reserved || 0) - Number(reservation.quantity || 0);
        if (nextReserved < -0.0005) throw new Error('Anbar rezerv qalığı sifariş rezervi ilə uyğun deyil.');
        const { error: balanceError } = await supabase.from('stock_balances')
          .update({ reserved: Math.max(0, nextReserved) }).eq('tenant_id', tenantId)
          .eq('warehouse_id', reservation.warehouse_id).eq('product_id', reservation.product_id);
        if (balanceError) throw balanceError;
      }
      if ((reservations || []).length) {
        const { error: reservationDeleteError } = await supabase.from('stock_reservations')
          .delete().eq('order_id', id).eq('tenant_id', tenantId);
        if (reservationDeleteError) throw reservationDeleteError;
      }

      const dependentTables = ['credit_contracts'];
      for (const table of dependentTables) {
        const { error: dependencyError } = await supabase.from(table).delete().eq('order_id', id).eq('tenant_id', tenantId);
        if (dependencyError && !/does not exist|schema cache/i.test(dependencyError.message || '')) throw dependencyError;
      }
      const { data: deletedRows, error: deleteError } = await supabase
        .from('orders').delete().eq('id', id).eq('tenant_id', tenantId).select('id');
      if (deleteError) throw deleteError;
      if (!deletedRows?.length) throw new Error('Sifariş silinmədi. İcazəni və sifarişin əlaqəli əməliyyatlarını yoxlayın.');
    }
    await fetchAll();
  };

  return { orders, loading, error, hasMore, loadMore, pageSize: limit, refresh: fetchAll, create, update, updateStatus, updateHeader, registerPayment, remove };
}
