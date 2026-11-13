// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// 20261113120000 brings a database that missed repo migrations (production) up to the repo schema.
// It must be a no-op on a database built from supabase/migrations and safe to run again.

const FILE = '20261113120000_production_schema_catch_up.sql';
const sql = readFileSync(new URL(`../../supabase/migrations/${FILE}`, import.meta.url), 'utf8');

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
}, 240000);
afterAll(async () => { await db?.close(); });

it('applies during the full replay', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('runs again without error on the complete schema', async () => {
  await expect(db.exec(sql)).resolves.toBeDefined();
});

it('restores the objects production was missing', async () => {
  const present = async (sqlText) => (await db.query(sqlText)).rows[0].ok;
  for (const fn of ['public.create_manual_journal_entry', 'public.create_tenant_invite', 'public.restructure_credit_contract',
    'public.decide_credit_adjustment', 'public.delete_sales_order_safe', 'public.pay_vendor_invoice_with_tax_atomic',
    'public.prepare_webhook_audit', 'private.reject_cancelled_order_child']) {
    expect(await present(`SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname || '.' || p.proname = '${fn}') AS ok`), fn).toBe(true);
  }
  for (const table of ['public.webhook_endpoints', 'public.webhook_dispatches', 'public.webhook_receipts', 'private.webhook_signing_keys',
    'public.po_payments', 'public.vendor_invoice_tax_postings', 'public.credit_collection_events']) {
    expect(await present(`SELECT to_regclass('${table}') IS NOT NULL AS ok`), table).toBe(true);
  }
  expect(await present(`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_posted_journal') AS ok`)).toBe(true);
});
