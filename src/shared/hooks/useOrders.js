import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';
import { useTenantRequestScope } from './useTenantRequestScope';
import { createIdempotencyKey, createSalesOrderComplete, editSalesOrderAtomic, migrationRequiredError, reverseSalesOrder } from '../../services/coreOperations';
import { ensureMainCashAccount } from '../../services/cashAccounts';
import { readOpeningCredits, readOrderById, readOrderPage, readOrderRelations } from '../../services/orderRead.js';
import { toLocalIsoDate } from '../../services/date.js';

function isMissingRpc(error) {
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || /function .* does not exist|schema cache/i.test(error?.message || '');
}

const ORDERS_PAGE_SIZE = 200;

export function useOrders(tenantId) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [loadedScope, setLoadedScope] = useState(null);
  const [orders, setOrders] = useState([]);
  const [openingCredits, setOpeningCredits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(ORDERS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const fetchAll = useCallback(async () => {
    const isCurrent = begin();
    if (!tenantId) {
      setOrders([]);
      setOpeningCredits([]);
      setLoaded(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await readOrderPage(tenantId, limit + 1, isCurrent);
      if (!isCurrent()) return;
      const visibleRows = rows.slice(0, limit);
      const orderIds = visibleRows.map((row) => row.id).filter(Boolean);
      let creditsByOrder = new Map();
      let bonusesByOrder = new Map();
      let deliveriesByOrder = new Map();
      if (orderIds.length) {
        const related = await readOrderRelations(tenantId, orderIds, isCurrent);
        if (!isCurrent()) return;
        creditsByOrder = new Map(related.credits.map((credit) => [credit.order_id, credit]));
        for (const bonus of related.bonuses) {
          const rows = bonusesByOrder.get(bonus.order_id) || [];
          rows.push(bonus);
          bonusesByOrder.set(bonus.order_id, rows);
        }
        deliveriesByOrder = new Map((related.deliveries || []).map((delivery) => [delivery.order_id, delivery]));
        if (related.deliveryError) console.warn('[orders] delivery history could not be loaded:', related.deliveryError);
      }
      if (!isCurrent()) return;
      const opening = await readOpeningCredits(tenantId, isCurrent);
      if (!isCurrent()) return;
      setError(null);
      setLoadedScope(scope);
      setOpeningCredits(opening || []);
      setHasMore(rows.length > limit);
      setOrders(visibleRows.map((row) => ({
        ...row,
        credit: creditsByOrder.get(row.id) || null,
        bonus_assignments: bonusesByOrder.get(row.id) || [],
        delivery: deliveriesByOrder.get(row.id) || null,
      })));
      setLoaded(true);
    } catch (error) {
      if (isCurrent()) { setError(error); setLoadedScope(null); setLoaded(false); }
    } finally { if (isCurrent()) setLoading(false); }
  }, [tenantId, limit, scope, begin]);

  useEffect(() => {
    setOrders([]);
    setOpeningCredits([]);
    setLoaded(false);
    setLimit(ORDERS_PAGE_SIZE);
  }, [scope]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + ORDERS_PAGE_SIZE), []);

  const getById = useCallback(async orderId => {
    if (!tenantId || !orderId) return null;
    const isCurrent = begin('order-detail');
    const order = await readOrderById(tenantId, orderId, isCurrent);
    if (!order || !isCurrent()) return null;
    const related = await readOrderRelations(tenantId, [order.id], isCurrent);
    if (!related || !isCurrent()) return null;
    return { ...order, credit: related.credits[0] || null, bonus_assignments: related.bonuses, delivery: related.deliveries[0] || null };
  }, [tenantId, begin]);

  useRealtimeResync(tenantId, ['orders', 'order_items', 'credit_contracts', 'credit_installments', 'credit_payments'], fetchAll, { channelPrefix: 'orders' });

  const resolveMainCashAccount = async (currency = 'AZN') => {
    return ensureMainCashAccount(tenantId, currency);
  };

  // Sales are created only through create_sales_order_complete: order, credit, bonus split and initial payment
  // commit in one server transaction (the old client-side multi-step paths were removed).
  const create = async ({ items = [], request_key: requestKey, credit = null, bonus_allocations: bonusAllocations = [], ...header }) => {
    if (!header.customer_id) throw new Error('Satış üçün müştəri seçilməlidir.');
    const isCurrent = begin('create');
    const initialPayment = Number(credit?.initial_payment || 0);
    const resolvedAccount = initialPayment > 0 ? await resolveMainCashAccount(header.currency || 'AZN') : null;
    const completeResult = await createSalesOrderComplete({
      tenantId, requestKey: requestKey || createIdempotencyKey('sales-order'), orderNo: header.order_no, customerId: header.customer_id,
      orderDate: header.order_date || toLocalIsoDate(),
      currency: header.currency || 'AZN', notes: header.notes || null, items, credit,
      bonusAllocations, initialPayment, accountId: resolvedAccount?.id || null,
    });
    // Hydrate only the committed order; refreshing a whole portfolio must not hold the form open.
    try {
      const row = await readOrderById(tenantId, completeResult.order_id, isCurrent);
      if (row && isCurrent()) {
        const related = await readOrderRelations(tenantId, [row.id], isCurrent);
        if (related && isCurrent()) {
          const saved = { ...row, credit: related.credits.find(item => item.order_id === row.id) || null,
            bonus_assignments: related.bonuses, delivery: related.deliveries[0] || null };
          setOrders(current => [saved, ...current.filter(item => item.id !== row.id)].slice(0, limit));
          setLoadedScope(scope);
          setLoaded(true);
          setError(null);
        }
      }
    } catch (readError) {
      if (isCurrent()) setError(readError);
    }
    if (isCurrent()) void fetchAll();
    return { id: completeResult.order_id, creditId: completeResult.credit_id };
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase.rpc('process_sales_order_status', { _order_id: id, _status: status });
    if (error) throw error;
    await fetchAll();
  };

  // Orders are server-write only: customer/date/notes go through update_sales_order_header, a status change
  // through process_sales_order_status (which also moves reservations, deliveries and accounting).
  /** @param {string} id @param {{ customer_id?: string | null, order_date?: string | null, notes?: string | null, status?: string | null }} patch */
  const updateHeader = async (id, { status = null, ...header } = {}) => {
    const { error } = await supabase.rpc('update_sales_order_header', {
      _tenant_id: tenantId, _order_id: id, _customer_id: header.customer_id || null,
      _order_date: header.order_date || null, _notes: header.notes ?? null,
    });
    if (error) throw error;
    if (status) {
      const { error: statusError } = await supabase.rpc('process_sales_order_status', { _order_id: id, _status: status });
      if (statusError) throw statusError;
    }
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
      else resolvedAccountId = (await resolveMainCashAccount(order.currency || 'AZN')).id;
    }

    const { error: paymentError } = await supabase.rpc('register_order_payment', {
      _order_id: order.id,
      _amount: payment,
      _account_id: resolvedAccountId,
    });
    if (paymentError) throw paymentError;
    await fetchAll();
  };

  const update = async (id, { items = [], expected_updated_at, request_key, ...header }) => {
    await editSalesOrderAtomic({ tenantId, orderId: id, requestKey: request_key || createIdempotencyKey(`sales-edit:${id}`),
      payload: { ...header, expected_updated_at, items } });
    await fetchAll();
  };

  const remove = async (id, reason = 'İstifadəçi tərəfindən satış ləğv edildi') => {
    await reverseSalesOrder({ tenantId, orderId: id, reason, requestKey: createIdempotencyKey(`sales-reversal:${id}`) });
    await fetchAll();
  };

  const previewRemoval = async (id) => {
    const { data, error: previewError } = await supabase.rpc('preview_sales_order_reversal', { _order_id: id });
    if (!previewError) return data;
    if (isMissingRpc(previewError)) throw migrationRequiredError('satış ləğvinin önizləməsi');
    throw previewError;
  };

  const current = Boolean(tenantId && loadedScope === scope && loaded);
  return { orders: current ? orders : EMPTY_ROWS, openingCredits: current ? openingCredits : EMPTY_ROWS, loading, loaded: current, error, hasMore: current && hasMore, loadMore, getById, pageSize: limit, refresh: fetchAll, create, update, updateStatus, updateHeader, registerPayment, remove, previewRemoval };
}

// Frozen so no caller can fill the shared empty list; typed as the hook's row array so pages that take
// plain arrays accept it (a readonly type made every prop it reached a checkJs error).
const EMPTY_ROWS = /** @type {any[]} */ (Object.freeze([]));

