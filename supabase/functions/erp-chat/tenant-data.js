const TABLES = new Set(['customers', 'products', 'orders', 'quotes', 'employees', 'projects']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export async function canReadTenant(client, tenantId, userId) {
  if (!isTenantId(tenantId) || !userId) return false;
  const { data, error } = await client.from('tenant_members').select('tenant_id')
    .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.tenant_id === tenantId;
}

export function tenantSelect(client, tenantId, table, columns, options = {}) {
  if (!isTenantId(tenantId) || !TABLES.has(table)) throw new Error('Invalid tenant query');
  return client.from(table).select(columns, options).eq('tenant_id', tenantId);
}
