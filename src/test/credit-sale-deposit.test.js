// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const account = '22222222-2222-4222-8222-222222222222';

it.each([false, true])('collects credit sale deposits once with legacy trigger=%s', async (trigger) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE operation_requests(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,request_hash text,
        status text DEFAULT 'pending',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
      CREATE TABLE cash_accounts(id uuid,tenant_id uuid,is_active boolean);
      INSERT INTO cash_accounts VALUES('${account}','${tenant}',true);
      CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),paid_amount numeric DEFAULT 0);
      CREATE TABLE credit_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,initial_payment numeric,required_initial numeric);
      CREATE TABLE cash_transactions(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,account_id uuid,reference_id uuid,direction text,
        amount numeric,created_at timestamptz DEFAULT now());
      CREATE FUNCTION public.register_order_payment(uuid,numeric,uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
      DECLARE payment uuid; BEGIN
        UPDATE orders SET paid_amount=paid_amount+$2 WHERE id=$1;
        INSERT INTO cash_transactions(tenant_id,account_id,reference_id,direction,amount)
          VALUES('${tenant}',$3,$1,'in',$2) RETURNING id INTO payment;
        RETURN payment;
      END $$;
      CREATE FUNCTION public.apply_credit_initial_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
        IF NEW.initial_payment>0 THEN PERFORM register_order_payment(NEW.order_id,NEW.initial_payment,'${tenant}'); END IF;
        RETURN NEW;
      END $$;
      ${trigger ? 'CREATE TRIGGER initial_collection AFTER INSERT ON credit_contracts FOR EACH ROW EXECUTE FUNCTION apply_credit_initial_payment();' : ''}
      CREATE FUNCTION public.create_sales_order_atomic(uuid,text,text,uuid,date,text,text,jsonb,jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
      DECLARE o uuid; c uuid; BEGIN
        INSERT INTO orders DEFAULT VALUES RETURNING id INTO o;
        IF $9 IS NOT NULL THEN
          INSERT INTO credit_contracts(order_id,initial_payment,required_initial)
            VALUES(o,($9->>'initial_payment')::numeric,($9->>'required_initial')::numeric) RETURNING id INTO c;
        END IF;
        RETURN jsonb_build_object('order_id',o,'credit_id',c);
      END $$;
      CREATE FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.post_credit_initial_payment(uuid,uuid,numeric,uuid,text) RETURNS numeric LANGUAGE plpgsql SET search_path=public AS $$
      DECLARE c credit_contracts%rowtype; BEGIN
        SELECT * INTO c FROM credit_contracts WHERE id=$2;
        IF c.required_initial-c.initial_payment<$3 THEN RAISE EXCEPTION 'initial_payment_exceeds_target'; END IF;
        PERFORM register_order_payment(c.order_id,$3,$4);
        UPDATE credit_contracts SET initial_payment=initial_payment+$3 WHERE id=c.id;
        RETURN c.required_initial-c.initial_payment-$3;
      END $$;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261001064737_post_credit_sale_deposit_once.sql', import.meta.url), 'utf8'));
    const call = (paid = 200, key = 'credit-sale') => db.query(`SELECT create_sales_order_complete(
      '${tenant}',$1,'SALE','${tenant}',current_date,'AZN',NULL,'[]',
      '{"initial_payment":200,"required_initial":2000}', '[]',$2,'${account}') result`, [key, paid]);
    const result = await call();
    expect((await call()).rows).toEqual(result.rows);
    expect((await db.query('SELECT paid_amount FROM orders')).rows[0].paid_amount).toBe('200.00');
    expect((await db.query('SELECT initial_payment,required_initial FROM credit_contracts')).rows[0])
      .toEqual({ initial_payment: '200.00', required_initial: '2000.00' });
    expect((await db.query('SELECT account_id,amount FROM cash_transactions')).rows)
      .toEqual([{ account_id: account, amount: '200.00' }]);
    expect(result.rows[0].result.initial_payment_id).toBeTruthy();
    await expect(call(300, 'bad-credit')).rejects.toThrow('credit_initial_payment_mismatch');
    expect((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int n FROM operation_requests WHERE request_key='bad-credit'")).rows[0].n).toBe(0);
    await db.exec(`CREATE OR REPLACE FUNCTION public.post_credit_initial_payment(uuid,uuid,numeric,uuid,text)
      RETURNS numeric LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'collection_failed'; END $$;`);
    await expect(call(200, 'failed-credit')).rejects.toThrow('collection_failed');
    expect((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n).toBe(1);
  } finally { await db.close(); }
}, 30000);
