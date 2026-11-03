// PostgREST returns at most 1000 rows per request (the project's max_rows), silently, with no
// error. Reads that need every row of a tenant (statements, ledgers, pickers) page through with
// range() instead. The query factory must be ordered on a unique column (add .order('id') last)
// so pages do not overlap or skip rows. Resolves to the same { data, error } shape as a single
// Supabase call so it drops into Promise.all destructuring.
export const READ_PAGE_SIZE = 500;

export async function readAllRows(query, pageSize = READ_PAGE_SIZE) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

// .in('id', ids) puts every id in the request URL; a few hundred UUIDs exceed what the gateway
// accepts. Reads the ids in chunks (each chunk paged with readAllRows, so the factory must be
// ordered on a unique column) and concatenates the rows.
export const ID_CHUNK_SIZE = 100;

export async function readRowsByIds(ids, queryForChunk, chunkSize = ID_CHUNK_SIZE) {
  const unique = [...new Set(ids.filter((id) => id !== null && id !== undefined && id !== ""))];
  const rows = [];
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    const chunk = unique.slice(offset, offset + chunkSize);
    const { data, error } = await readAllRows(() => queryForChunk(chunk));
    if (error) return { data: null, error };
    rows.push(...data);
  }
  return { data: rows, error: null };
}
