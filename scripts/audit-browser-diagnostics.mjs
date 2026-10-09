export function collectAuditRequests(page) {
  const pending = new Map();
  const completed = [];
  const describe = request => ({ method: request.method(), path: new URL(request.url()).pathname });
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/rest/v1/')) pending.set(request, { ...describe(request), started: Date.now() });
  });
  const finish = (request, status) => {
    const entry = pending.get(request);
    if (!entry) return;
    pending.delete(request);
    completed.push({ method: entry.method, path: entry.path, status, milliseconds: Date.now() - entry.started });
    if (completed.length > 100) completed.shift();
  };
  page.on('requestfinished', async request => finish(request, (await request.response())?.status()));
  page.on('requestfailed', request => finish(request, 'network-failure'));
  return () => ({
    completed: [...completed],
    pending: [...pending.values()].map(entry => ({ method: entry.method, path: entry.path, milliseconds: Date.now() - entry.started })),
  });
}
