export async function readTenantPage(query, limit, isCurrent) {
  const rows = [];
  while (isCurrent() && rows.length < limit) {
    const requested = Math.min(500, limit - rows.length);
    const result = await query().range(rows.length, rows.length + requested - 1);
    if (!isCurrent()) return null;
    if (result.error) return { data: null, error: result.error };
    const page = result.data || [];
    rows.push(...page);
    // PostgREST can cap responses below the requested range size.
    if (Number.isInteger(result.count)) {
      if (rows.length >= result.count) break;
      if (!page.length) return { data: null, error: new Error('Incomplete tenant page response') };
    } else if (page.length < requested) break;
  }
  return isCurrent() ? { data: rows.slice(0, limit), error: null } : null;
}
