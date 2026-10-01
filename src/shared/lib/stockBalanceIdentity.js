export const stockBalanceKey = (row) => {
  if (!row?.tenant_id || !row?.warehouse_id || !row?.product_id) return null;
  return JSON.stringify([row.tenant_id, row.warehouse_id, row.product_id]);
};
