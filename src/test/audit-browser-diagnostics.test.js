// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { collectAuditRequests } from '../../scripts/audit-browser-diagnostics.mjs';

function setup() {
  const handlers = {};
  const snapshot = collectAuditRequests({ on: (event, handler) => { handlers[event] = handler; } });
  const request = { method: () => 'GET', url: () => 'http://localhost/rest/v1/orders', response: vi.fn() };
  return { handlers, snapshot, request };
}

it('records page-close races without an unhandled event-listener rejection', async () => {
  const { handlers, snapshot, request } = setup();
  request.response.mockRejectedValue(new Error('Target page, context or browser has been closed'));
  handlers.request(request);
  await expect(handlers.requestfinished(request)).resolves.toBeUndefined();
  expect(snapshot().pending).toEqual([]);
  expect(snapshot().completed).toEqual([expect.objectContaining({ path: '/rest/v1/orders', status: 'response-unavailable' })]);
});

it('does not fetch responses for untracked requests and preserves HTTP failures', async () => {
  const { handlers, snapshot, request } = setup();
  await handlers.requestfinished(request);
  expect(request.response).not.toHaveBeenCalled();
  handlers.request(request);
  request.response.mockResolvedValue({ status: () => 500 });
  await handlers.requestfinished(request);
  expect(snapshot().completed[0].status).toBe(500);
});

it('does not duplicate a failure that arrives while response retrieval is pending', async () => {
  const { handlers, snapshot, request } = setup();
  let reject;
  request.response.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  handlers.request(request);
  const finish = handlers.requestfinished(request);
  handlers.requestfailed(request);
  reject(new Error('closed'));
  await finish;
  expect(snapshot().completed).toHaveLength(1);
  expect(snapshot().completed[0].status).toBe('network-failure');
});
