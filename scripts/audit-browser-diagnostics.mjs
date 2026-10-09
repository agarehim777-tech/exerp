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

export async function startAuditCpuProfile(context, page) {
  const session = await context.newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.start');
  return async () => {
    try {
      const { profile } = await session.send('Profiler.stop');
      const hits = new Map();
      const nodes = new Map(profile.nodes.map(node => [node.id, node]));
      for (let i = 0; i < (profile.samples || []).length; i++) {
        const node = nodes.get(profile.samples[i]);
        if (!node) continue;
        const frame = node.callFrame;
        const key = `${frame.functionName || '(anonymous)'} ${frame.url ? new URL(frame.url).pathname : ''}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
        hits.set(key, (hits.get(key) || 0) + (profile.timeDeltas?.[i] || 0));
      }
      return [...hits].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([frame, microseconds]) => ({ frame, milliseconds: Math.round(microseconds / 1000) }));
    } finally { await session.detach(); }
  };
}
