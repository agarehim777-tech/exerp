CREATE UNIQUE INDEX IF NOT EXISTS stock_balances_tenant_warehouse_product_key
  ON public.stock_balances (tenant_id, warehouse_id, product_id);