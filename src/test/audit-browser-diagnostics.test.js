import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { collectAuditRequests } from '../../scripts/audit-browser-diagnostics.mjs';

describe('sanitized audit request evidence', () => {
  it('records latency and pending requests without query strings or credentials', async () => {
    const page = new EventEmitter();
    const snapshot = collectAuditRequests(page);
    const request = { method: () => 'POST', url: () => 'https://example.test/rest/v1/rpc/create_sales_order_complete?secret=private', response: async () => ({ status: () => 200 }) };
    page.emit('request', request);
    expect(snapshot().pending).toEqual([{ method: 'POST', path: '/rest/v1/rpc/create_sales_order_complete', milliseconds: expect.any(Number) }]);
    page.emit('requestfinished', request);
    await Promise.resolve();
    expect(snapshot().pending).toHaveLength(0);
    expect(snapshot().completed[0].status).toBe(200);
    expect(JSON.stringify(snapshot())).not.toContain('private');
    page.emit('request', request);
    page.emit('requestfailed', request);
    expect(snapshot().completed[1].status).toBe('network-failure');
  });
});
