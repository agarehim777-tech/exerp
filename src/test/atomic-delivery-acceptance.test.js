// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const warehouse = '33333333-3333-4333-8333-333333333333';
const acceptance = { recipientName: 'Test recipient', documentNo: 'TEST', warehouseEmployeeName: 'Test warehouse', signatureConfirmed: true, note: '' };

it('commits delivery acceptance and stock posting once, or rolls both back', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
      CREATE TABLE operation_requests(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,
        request_hash text,status text DEFAULT 'processing',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
      CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid,order_no text,status text);
      CREATE TABLE warehouses(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
      CREATE TABLE stock_reservations(tenant_id uuid,order_id uuid,warehouse_id uuid,status text);
      CREATE TABLE stock_test(qty int);
      CREATE TABLE deliveries(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,order_id uuid,warehouse_id uuid,delivery_no text,
        status text,recipient_name text,recipient_document text,acceptance_name text,acceptance_document_no text,
        acceptance_signature text,acceptance_note text,warehouse_employee_name text,accepted_at timestamptz,
        delivered_at timestamptz,delivered_by uuid,created_by uuid,updated_at timestamptz,UNIQUE(tenant_id,order_id));
      CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
      INSERT INTO orders VALUES('${order}','${tenant}','TEST','confirmed');
      INSERT INTO warehouses VALUES('${warehouse}','${tenant}',true);
      INSERT INTO stock_test VALUES(5);
      CREATE FUNCTION public.mark_sales_order_delivered(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE order_id=$1 AND status='ready') THEN RAISE EXCEPTION 'warehouse_constraint_missing'; END IF;
        UPDATE public.orders SET status='delivered' WHERE id=$1; UPDATE public.stock_test SET qty=qty-1;
      END $$;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261003072549_atomic_delivery_acceptance.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/20261003073432_atomic_delivery_acceptance_finalize.sql', import.meta.url), 'utf8'));
    const call = (key = 'delivery', value = acceptance, tenantId = tenant, warehouseId = warehouse) => db.query(
      `SELECT public.complete_sales_delivery($1,'${order}',$2,$3,$4) result`, [tenantId, warehouseId, key, value]);
    await expect(call('bad-act', { ...acceptance, signatureConfirmed: false })).rejects.toThrow('delivery_acceptance_required');
    await expect(call('bad-tenant', acceptance, order)).rejects.toThrow('permission_denied');
    await expect(call('bad-warehouse', acceptance, tenant, order)).rejects.toThrow('warehouse_not_found');
    await db.exec(`CREATE FUNCTION fail_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status='delivered' THEN RAISE EXCEPTION 'acceptance_write_failed'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_acceptance BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION fail_acceptance();`);
    await expect(call()).rejects.toThrow('acceptance_write_failed');
    expect((await db.query('SELECT qty FROM stock_test')).rows[0].qty).toBe(5);
    expect((await db.query('SELECT status FROM orders')).rows[0].status).toBe('confirmed');
    expect((await db.query('SELECT count(*)::int n FROM deliveries')).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int n FROM operation_requests')).rows[0].n).toBe(0);
    await db.exec('DROP TRIGGER fail_acceptance ON public.deliveries');
    await db.exec(`INSERT INTO deliveries(tenant_id,order_id,delivery_no,status) VALUES('${tenant}','${order}','TEST','pending')`);
    const result = await call();
    expect((await call()).rows).toEqual(result.rows);
    expect((await db.query('SELECT qty FROM stock_test')).rows[0].qty).toBe(4);
    expect((await db.query('SELECT status,warehouse_id,acceptance_name,acceptance_signature FROM deliveries')).rows[0])
      .toEqual({ status: 'delivered', warehouse_id: warehouse, acceptance_name: 'Test recipient', acceptance_signature: 'confirmed' });
    expect((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n).toBe(1);
    await expect(call('other-key')).rejects.toThrow('order_already_delivered');
    await expect(call('delivery', { ...acceptance, documentNo: 'CHANGED' })).rejects.toThrow('idempotency_key_payload_mismatch');
    await db.exec(`UPDATE orders SET status='cancelled'`);
    await expect(call('cancelled')).rejects.toThrow('cancelled_order_is_terminal');
  } finally { await db.close(); }
}, 30000);
