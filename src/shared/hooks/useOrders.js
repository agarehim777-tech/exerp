import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

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

export function useOrders(tenantId) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(id,name), items:order_items(*)')
      .eq('tenant_id', tenantId)
      .order('order_date', { ascending: false });
    if (error) setError(error);
    else setOrders(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`orders:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async ({ items = [], request_key: requestKey, credit = null, ...header }) => {
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
      await fetchAll();
      return { id: orderId };
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
        status: header.status || 'draft',
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
    await fetchAll();
    return order;
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase.rpc('process_sales_order_status', { _order_id: id, _status: status });
    if (error) throw error;
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
        const { data: createdAccount, error: createAccountError } = await supabase.from('cash_accounts').insert({
          tenant_id: tenantId, name: 'Əsas kassa', type: 'cash', currency: order.currency || 'AZN', opening_balance: 0, is_active: true,
        }).select('id').single();
        if (createAccountError) throw createAccountError;
        resolvedAccountId = createdAccount.id;
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
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return { orders, loading, error, refresh: fetchAll, create, update, updateStatus, updateHeader, registerPayment, remove };
}
