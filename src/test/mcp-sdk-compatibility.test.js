// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { auth, defineMcp } from '@lovable.dev/mcp-js';
import { createMcpProtocolHandler } from '@lovable.dev/mcp-js/protocols/mcp';
import { createSupabaseHandler } from '@lovable.dev/mcp-js/stacks/supabase';
import echoTool from '../lib/mcp/tools/echo';

const definition = extra => defineMcp({
  name: 'erp-compatibility', title: 'ERP compatibility', version: '1.0.0',
  instructions: '', metrics: false, tools: [echoTool], ...extra,
});
const request = (method, params = {}) => new Request('https://erp.example/functions/v1/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});
async function result(response) {
  expect(response.status).toBe(200);
  const body = await response.text();
  const data = body.split('\n').find(line => line.startsWith('data: '));
  const message = JSON.parse(data ? data.slice(6) : body);
  expect(message.error).toBeUndefined();
  return message.result;
}

it('resolves the patched SDK from the Lovable dependency with a matching locked override', async () => {
  const require = createRequire(import.meta.url);
  const fromLovable = createRequire(require.resolve('@lovable.dev/mcp-js'));
  const sdkPath = pathToFileURL(fromLovable.resolve('@modelcontextprotocol/sdk/server/mcp.js'));
  const sdk = JSON.parse(await readFile(new URL('../../../package.json', sdkPath), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  expect(sdk.version).toBe('1.31.0');
  expect(manifest.overrides['@modelcontextprotocol/sdk']).toBe(sdk.version);
  const installed = Object.entries(lock.packages).filter(([path]) => path.endsWith('node_modules/@modelcontextprotocol/sdk'));
  expect(installed).toHaveLength(1);
  expect(installed[0][1].version).toBe(sdk.version);
});

it('serves initialization, tool discovery and the existing echo tool with the patched transport', async () => {
  const handler = createMcpProtocolHandler(definition());
  const initialized = await result(await handler(request('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'compatibility-test', version: '1.0.0' },
  })));
  expect(initialized.serverInfo.name).toBe('erp-compatibility');
  const catalog = await result(await handler(request('tools/list')));
  expect(catalog.tools.map(tool => tool.name)).toEqual(['echo']);
  const called = await result(await handler(request('tools/call', { name: 'echo', arguments: { text: 'ERP SDK compatibility' } })));
  expect(called.isError).not.toBe(true);
  expect(called.content).toEqual([{ type: 'text', text: 'ERP SDK compatibility' }]);
});

it('keeps the Supabase OAuth gate enabled for unauthenticated MCP requests', async () => {
  const handler = createSupabaseHandler(definition({
    auth: auth.oauth.issuer({ issuer: 'https://staging.example/auth/v1', acceptedAudiences: 'authenticated' }),
  }), { functionName: 'mcp' });
  const response = await handler(request('tools/list'));
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
});
