// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// Seeds one row per table for two tenants on the fully replayed schema, purges one of them and
// checks that nothing of it is left and that the other tenant is untouched. Because the seed set
// is read from the catalog, a new tenant table that the purge misses fails this test.

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const TENANT_A = '00000000-0000-4000-8000-00000000000a';
const TENANT_B = '00000000-0000-4000-8000-00000000000b';

let db;
let seeded;

const ident = (name) => `"${name.replaceAll('"', '""')}"`;

async function catalog() {
  const columns = (await db.query(`
    SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type,
           t.typtype, a.attnotnull AS not_null, a.atthasdef AS has_default, a.attidentity <> '' AS identity,
           a.attgenerated <> '' AS generated,
           (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = a.atttypid) AS labels
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    ORDER BY c.relname, a.attnum`)).rows;
  const fks = (await db.query(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
           ca.attname AS child_column, pa.attname AS parent_column
    FROM pg_constraint c
    JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND cardinality(c.conkey) = 1 AND c.connamespace = 'public'::regnamespace`)).rows;
  const checks = (await db.query(`
    SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`)).rows;
  const tables = new Map();
  for (const column of columns) {
    if (!tables.has(column.table_name)) tables.set(column.table_name, []);
    tables.get(column.table_name).push(column);
  }
  return { tables, fks, checks };
}

// Picks a value the column's CHECK constraints accept when they enumerate allowed literals.
function allowedLiteral(checks, table, column) {
  const pattern = new RegExp(`\\(${column} = (?:ANY \\(ARRAY\\[)?'([^']*)'::text`);
  for (const { def } of checks.filter((check) => check.table_name === table)) {
    const literal = def.match(pattern);
    if (literal) return literal[1];
  }
  return null;
}

// Multi-column CHECK constraints the generic seeder cannot infer.
const overrides = {
  credit_contracts: () => ({ term_months: 12, principal: 1000, initial_payment: 0 }),
  credit_payments: () => ({ amount: 1, principal_amount: 1, penalty_amount: 0, unallocated_amount: 0 }),
  credit_restructures: () => ({ new_term_months: 12 }),
  finance_budgets: () => ({ fiscal_year: 2026, period_month: 10 }),
  credit_payment_allocations: () => ({ principal_amount: 1, penalty_amount: 0 }),
  order_bonus_assignments: () => ({ seller_name: 'Seed Seller' }),
  vendor_invoice_tax_postings: () => ({ net_amount: 100, tax_amount: 18, gross_amount: 118 }),
  receivable_settlements: (rows) => ({ source_type: 'order', source_id: rows.get('orders').id,
    order_id: rows.get('orders').id, credit_id: null, invoice_id: null }),
  kpi_periods: () => ({ status: 'closed', period: '2026-10-01', approved_at: null, paid_at: null }),
};

function valueFor(column, checks, table, tenant) {
  if (column.column_name === 'tenant_id' && column.type === 'uuid') return tenant;
  if (column.labels?.length) return column.labels[0];
  const literal = column.type === 'text' ? allowedLiteral(checks, table, column.column_name) : null;
  if (literal !== null) return literal;
  const type = column.type;
  if (type === 'uuid') return crypto.randomUUID();
  if (/^(integer|bigint|smallint|numeric|real|double precision)/.test(type)) return 1;
  if (type === 'boolean') return false;
  if (type === 'date') return '2026-10-01';
  if (type.startsWith('timestamp')) return '2026-10-01T00:00:00Z';
  if (type === 'jsonb' || type === 'json') return {};
  if (type.endsWith('[]')) return [];
  if (type === 'interval') return '1 day';
  return `seed-${crypto.randomUUID().slice(0, 8)}`;
}

// Parents first; self references and cycles are left NULL where possible.
function insertOrder(tables, fks) {
  const order = [];
  const done = new Set();
  const visiting = new Set();
  const visit = (table) => {
    if (done.has(table) || visiting.has(table) || !tables.has(table)) return;
    visiting.add(table);
    for (const fk of fks) if (fk.child === table && fk.parent !== table) visit(fk.parent);
    visiting.delete(table);
    done.add(table);
    order.push(table);
  };
  for (const table of tables.keys()) visit(table);
  return order;
}

async function seedTenant(tenant, { tables, fks, checks }, order) {
  const rows = new Map([['auth.users', { id: ADMIN }]]);
  const failed = [];
  for (const table of ['tenants', ...order.filter((name) => name !== 'tenants')]) {
    if (table === 'platform_admins') continue;
    const columns = tables.get(table).filter((column) => !column.generated && !column.identity);
    const values = table === 'tenants' ? { id: tenant, created_by: ADMIN } : {};
    for (const column of columns) {
      if (column.column_name in values) continue;
      const fk = fks.find((item) => item.child === table && item.child_column === column.column_name);
      if (fk) {
        const parent = rows.get(fk.parent);
        if (parent && parent[fk.parent_column] !== undefined) values[column.column_name] = parent[fk.parent_column];
        else if (column.not_null && !column.has_default) values[column.column_name] = valueFor(column, checks, table, tenant);
        continue;
      }
      if (column.column_name === 'tenant_id' || (column.not_null && !column.has_default)) {
        values[column.column_name] = valueFor(column, checks, table, tenant);
      }
    }
    Object.assign(values, overrides[table]?.(rows));
    const names = Object.keys(values);
    const sql = names.length
      ? `INSERT INTO ${table} (${names.map(ident).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`
      : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
    try {
      await db.exec('SAVEPOINT seed');
      const [row] = (await db.query(sql, names.map((name) => values[name]))).rows;
      await db.exec('RELEASE SAVEPOINT seed');
      rows.set(table, row);
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT seed');
      failed.push(`${table}: ${error.message.split('\n')[0]}`);
    }
  }
  return { rows, failed };
}

async function rowsOf(tenant, tables) {
  const counts = {};
  for (const [table, columns] of tables) {
    if (!columns.some((column) => column.column_name === 'tenant_id' && column.type === 'uuid')) continue;
    counts[table] = Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`, [tenant])).rows[0].n);
  }
  return counts;
}

beforeAll(async () => {
  ({ db } = await replayMigrations());
  const schema = await catalog();
  const order = insertOrder(schema.tables, schema.fks);
  await db.exec('BEGIN; SET LOCAL session_replication_role = replica;');
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [ADMIN, 'platform@example.invalid']);
  await db.query('INSERT INTO platform_admins (user_id) VALUES ($1)', [ADMIN]);
  const a = await seedTenant(TENANT_A, schema, order);
  const b = await seedTenant(TENANT_B, schema, order);
  await db.exec('COMMIT');
  seeded = { schema, a, b };
}, 120000);

afterAll(async () => { await db?.close(); });

it('seeds every tenant-scoped table so the purge is exercised against all of them', async () => {
  const tenantTables = [...seeded.schema.tables].filter(([, columns]) =>
    columns.some((column) => column.column_name === 'tenant_id' && column.type === 'uuid')).map(([name]) => name);
  const missing = tenantTables.filter((table) => !seeded.a.rows.has(table));
  expect({ missing, failures: seeded.a.failed }).toEqual({ missing: [], failures: [] });
});

it('removes every row of the purged tenant and leaves no dangling references', async () => {
  const before = await rowsOf(TENANT_B, seeded.schema.tables);
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ADMIN}', false)`);
  await db.query('SELECT public.platform_delete_tenant($1)', [TENANT_A]);
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);

  const left = Object.entries(await rowsOf(TENANT_A, seeded.schema.tables)).filter(([, n]) => n > 0);
  expect(left).toEqual([]);
  expect((await db.query('SELECT count(*) AS n FROM tenants WHERE id = $1', [TENANT_A])).rows[0].n).toBe(0);
  expect(await rowsOf(TENANT_B, seeded.schema.tables)).toEqual(before);

  const dangling = [];
  for (const fk of seeded.schema.fks) {
    const { n } = (await db.query(`SELECT count(*) AS n FROM ${fk.child} c
      WHERE c.${ident(fk.child_column)} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE p.${ident(fk.parent_column)} = c.${ident(fk.child_column)})`)).rows[0];
    if (Number(n) > 0) dangling.push(`${fk.child}.${fk.child_column} -> ${fk.parent}.${fk.parent_column}: ${n}`);
  }
  expect(dangling).toEqual([]);
  expect((await db.query("SELECT current_setting('session_replication_role') AS role")).rows[0].role).toBe('origin');
});

it('refuses callers that are not platform admins', async () => {
  await expect(db.query('SELECT public.platform_delete_tenant($1)', [TENANT_B])).rejects.toThrow('forbidden');
});
