-- platform_delete_tenant relied on ON DELETE CASCADE plus a hand-kept list of ledger tables.
-- Tables added since (receivable_settlements, kpi_periods, production_batches, webhook_*,
-- vendor_invoice_*) reference tenants without CASCADE, many ledger FKs are RESTRICT, and the
-- period-lock / posted-ledger guard triggers reject deletes outright, so the purge could no
-- longer succeed. Temporary E2E tenants and the audit tenant were left behind as a result.
--
-- The purge now reads the tenant-scoped tables from the catalog, so new tables are covered
-- without editing this function. Guards and FK actions are suspended for this transaction only
-- (session_replication_role = replica); src/test/tenant-purge.test.js checks that no row of the
-- purged tenant and no dangling reference remain.

CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  target record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN RAISE EXCEPTION 'tenant_not_found'; END IF;

  PERFORM set_config('app.tenant_purge', 'on', true);
  SET LOCAL session_replication_role = replica;

  -- Rows without their own tenant_id that hang off a tenant-scoped parent (journal_lines, *_lines, ...).
  FOR target IN
    SELECT c.conrelid::regclass AS child_table, c.confrelid::regclass AS parent_table,
           ca.attname AS child_column, pa.attname AS parent_column
    FROM pg_constraint c
    JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
      AND c.connamespace = 'public'::regnamespace
      AND c.confrelid <> 'public.tenants'::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_attribute t
                      WHERE t.attrelid = c.conrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute t
                  WHERE t.attrelid = c.confrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped
                    AND t.atttypid = 'uuid'::regtype)
  LOOP
    EXECUTE format('DELETE FROM %s child USING %s parent WHERE child.%I = parent.%I AND parent.tenant_id = $1',
      target.child_table, target.parent_table, target.child_column, target.parent_column) USING _tenant;
  END LOOP;

  -- Logs that reference tenants with ON DELETE SET NULL keep their rows, as the FK intends.
  FOR target IN
    SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.tenants'::regclass AND c.confdeltype = 'n'
      AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', target.table_name, target.column_name, target.column_name)
      USING _tenant;
  END LOOP;

  FOR target IN
    SELECT c.oid::regclass AS table_name
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
                       AND a.atttypid = 'uuid'::regtype
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint n
                      WHERE n.conrelid = c.oid AND n.contype = 'f' AND n.confrelid = 'public.tenants'::regclass
                        AND n.confdeltype = 'n')
  LOOP
    EXECUTE format('DELETE FROM %s WHERE tenant_id = $1', target.table_name) USING _tenant;
  END LOOP;

  DELETE FROM public.tenants WHERE id = _tenant;

  SET LOCAL session_replication_role = origin;
  PERFORM set_config('app.tenant_purge', 'off', true);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) TO authenticated;
