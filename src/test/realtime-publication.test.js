// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// Every table the app listens to for live updates must be in the supabase_realtime publication, or no
// change event is ever sent. Only eight tables were published while ~35 were subscribed
// (migration 20261123110000 adds the rest).
// @babel/traverse is CommonJS: Node ESM gets the function on .default.
const traverse = /** @type {any} */ (traverseModule).default || traverseModule;

async function subscribedTables() {
  const files = execSync('git ls-files "src/**/*.js" "src/**/*.jsx" "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
    .trim().split('\n').filter((file) => !/\/test\/|integrations\//.test(file));
  const tables = new Set();
  const namedLists = new Map();
  const pendingNames = [];
  const strings = (node) => {
    if (!node) return [];
    if (node.type === 'StringLiteral') return [node.value];
    if (node.type === 'ArrayExpression') return node.elements.flatMap(strings);
    if (node.type === 'SpreadElement') return strings(node.argument);
    if (node.type === 'ConditionalExpression') return [...strings(node.consequent), ...strings(node.alternate)];
    if (node.type === 'CallExpression') return node.arguments.flatMap(strings); // Object.freeze([...])
    return [];
  };
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!/postgres_changes|useRealtimeResync|Object\.freeze\(\[/.test(source)) continue;
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    traverse(ast, {
      VariableDeclarator(path) {
        if (path.node.id.type === 'Identifier') namedLists.set(path.node.id.name, strings(path.node.init));
      },
      CallExpression(path) {
        const { callee, arguments: args } = path.node;
        if (callee.type === 'Identifier' && callee.name === 'useRealtimeResync') {
          if (args[1]?.type === 'Identifier') pendingNames.push(args[1].name);
          else strings(args[1]).forEach((table) => tables.add(table));
        }
        if (callee.type === 'MemberExpression' && callee.property.name === 'on' && args[0]?.value === 'postgres_changes'
          && args[1]?.type === 'ObjectExpression') {
          const table = args[1].properties.find((p) => p.type === 'ObjectProperty' && (p.key.name || p.key.value) === 'table');
          if (table?.value.type === 'StringLiteral') tables.add(table.value.value);
        }
      },
    });
  }
  for (const name of pendingNames) (namedLists.get(name) || []).forEach((table) => tables.add(table));
  return [...tables].sort();
}

let db;
beforeAll(async () => { ({ db } = await replayMigrations()); }, 240000);
afterAll(async () => { await db?.close(); });

it('publishes every table the app subscribes to', async () => {
  const subscribed = await subscribedTables();
  expect(subscribed.length).toBeGreaterThan(30);
  const { rows } = await db.query(`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'`);
  const published = new Set(rows.map((row) => row.tablename));
  expect(subscribed.filter((table) => !published.has(table))).toEqual([]);
});
