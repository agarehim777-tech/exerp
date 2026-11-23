// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { expect, it } from 'vitest';

// Client queries must match the database schema in src/integrations/supabase/types.ts (generated from
// supabase/migrations). Mismatches only fail at runtime against the real database, e.g. the Anbar page wrote
// retired stock_movements columns, Data barışdırması sorted stock_balances by a missing id and selected a
// missing cash_transactions.reversed_at, and Mühasibat called a seed_default_coa function no migration made.
// Checked: insert/update/upsert object keys, top-level select fields, filter/order columns, rpc names and
// argument names. Regenerate types.ts after a schema change (see AGENTS.md).
// @babel/traverse is CommonJS: Node ESM gets the function on .default.
const traverse = /** @type {any} */ (traverseModule).default || traverseModule;
const FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'ilike', 'like', 'order']);
// Known mismatches fixed in an open PR; remove the entry when it lands.
const ALLOWED = new Set([]);

async function schema() {
  const types = await readFile('src/integrations/supabase/types.ts', 'utf8');
  const publicPart = types.slice(types.indexOf('"public": {'));
  const tables = new Map();
  for (const match of publicPart.matchAll(/"([a-z_0-9]+)": \{\s*Row: \{([^}]*)\}/g)) {
    if (!tables.has(match[1])) tables.set(match[1], new Set([...match[2].matchAll(/"([a-zA-Z_0-9]+)"\??:/g)].map((m) => m[1])));
  }
  const fnStart = publicPart.indexOf('Functions: {');
  const functions = new Map();
  let current = null;
  for (const line of publicPart.slice(fnStart, publicPart.indexOf('Enums: {', fnStart)).split(/\r?\n/)) {
    const name = line.match(/^\s*"([a-z_0-9]+)":\s*$/);
    if (name) { current = name[1]; if (!functions.has(current)) functions.set(current, []); continue; }
    const args = line.match(/Args: (\{[^}]*\}|never|Record<PropertyKey, never>)/);
    if (args && current) functions.get(current).push(new Set([...args[1].matchAll(/"([a-zA-Z_0-9]+)"\??:/g)].map((m) => m[1])));
  }
  return { tables, functions };
}

function topLevelFields(select) {
  const parts = []; let depth = 0; let current = '';
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part && part !== '*' && !part.includes('(') && !part.includes('->'))
    .map((part) => (part.includes(':') ? part.split(':')[1] : part).split('::')[0].trim());
}

function tableOf(node) {
  let object = node;
  while (object) {
    if (object.type === 'CallExpression' && object.callee.type === 'MemberExpression' && object.callee.property.name === 'from'
      && object.arguments[0]?.type === 'StringLiteral') return object.arguments[0].value;
    object = object.type === 'CallExpression' ? object.callee.object : object.type === 'MemberExpression' ? object.object : null;
  }
  return null;
}

it('keeps client queries and rpc calls in line with the database schema', async () => {
  const { tables, functions } = await schema();
  expect(tables.size).toBeGreaterThan(50);
  expect(functions.size).toBeGreaterThan(50);
  const files = execSync('git ls-files "src/**/*.js" "src/**/*.jsx" "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
    .trim().split('\n').filter((file) => !/\/test\/|integrations\//.test(file));
  const problems = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!source.includes('.from(') && !source.includes('rpc(')) continue;
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    traverse(ast, {
      CallExpression(path) {
        const { callee, arguments: args } = path.node;
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return;
        const method = callee.property.name;
        const line = path.node.loc.start.line;
        if (method === 'rpc') {
          const [name, payload] = args;
          if (name?.type !== 'StringLiteral') return;
          const signatures = functions.get(name.value);
          if (!signatures) { problems.push(`${file}:${line} rpc ${name.value} does not exist`); return; }
          if (payload?.type !== 'ObjectExpression' || payload.properties.some((p) => p.type !== 'ObjectProperty')) return;
          const keys = payload.properties.map((p) => p.key.name || p.key.value);
          if (!signatures.some((signature) => keys.every((key) => signature.has(key)))) {
            problems.push(`${file}:${line} rpc ${name.value}(${keys.join(', ')}) matches no signature`);
          }
          return;
        }
        const table = tableOf(callee.object);
        if (!table || !tables.has(table) || ALLOWED.has(`${file} ${table}.${method}`)) return;
        const columns = tables.get(table);
        let used = [];
        if (['insert', 'update', 'upsert'].includes(method)) {
          const values = args[0]?.type === 'ArrayExpression' ? args[0].elements : [args[0]];
          used = values.filter((value) => value?.type === 'ObjectExpression')
            .flatMap((value) => value.properties.filter((p) => p.type === 'ObjectProperty').map((p) => p.key.name || p.key.value));
        } else if (method === 'select' && args[0]?.type === 'StringLiteral') {
          used = topLevelFields(args[0].value);
        } else if (FILTERS.has(method) && args[0]?.type === 'StringLiteral' && !/[.(]/.test(args[0].value)) {
          used = [args[0].value];
        }
        const unknown = [...new Set(used.filter((column) => !columns.has(column)))];
        if (unknown.length) problems.push(`${file}:${line} ${table}.${method}: ${unknown.join(', ')}`);
      },
    });
  }
  expect(problems).toEqual([]);
}, 60000);
