import { readFile, writeFile } from 'node:fs/promises';

// pg_dump plain archives describe each object in a fixed TOC header. Keep
// application DDL only; managed Auth/Storage schemas and archived data stay intact.
export function extractApplicationSchema(dump) {
  const header = /^--\r?\n-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner: .*?\r?\n--\r?\n/gm;
  const entries = [...dump.matchAll(header)];
  if (!entries.length) throw new Error('Unsupported pg_dump format: no TOC headers');
  const selected = entries.flatMap((match, i) => {
    const [, name, type, schema] = match;
    if (schema === 'public' && ['TABLE DATA', 'SEQUENCE SET', 'MATERIALIZED VIEW DATA'].includes(type)) {
      throw new Error('Schema recovery does not import business data');
    }
    const keep = schema === 'public' || (schema === 'private' && type === 'FUNCTION') ||
      (schema === 'auth' && type === 'TRIGGER' && name === 'users on_auth_user_created');
    if (!keep) return [];
    let sql = dump.slice(match.index + match[0].length, entries[i + 1]?.index ?? dump.length)
      .replace(/^\\unrestrict .*$/gm, '').trim();
    if (type === 'FUNCTION') sql = sql.replace(/^CREATE FUNCTION /, 'CREATE OR REPLACE FUNCTION ');
    if (schema === 'public' && type === 'TABLE' && name === 'legacy_snapshot_archive') throw new Error('Unexpected archive location');
    return [{ name, type, schema, sql }];
  });
  if (!selected.some((entry) => entry.type === 'TABLE' && entry.name === 'tenants')) throw new Error('Missing application tenant schema');
  return {
    entries: selected.map(({ sql, ...entry }) => entry),
    sql: `SET check_function_bodies = false;\nSET search_path = public, extensions;\n${selected.map((entry) => entry.sql).join('\n\n')}\n`
  };
}

if (process.argv[1]?.endsWith('extract-application-schema.mjs')) {
  const result = extractApplicationSchema(await readFile(process.argv[2], 'utf8'));
  await writeFile(process.argv[3], result.sql);
  console.log(JSON.stringify({ objects: result.entries.length, tables: result.entries.filter((e) => e.type === 'TABLE').length, bytes: result.sql.length }));
}
