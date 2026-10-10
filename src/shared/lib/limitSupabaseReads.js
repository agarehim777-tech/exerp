export function limitSupabaseReads(fetcher, limit = 4) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid read concurrency limit');
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length) {
      const task = queue.shift();
      task.signal?.removeEventListener('abort', task.abort);
      active += 1;
      Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  };
  return (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const url = new URL(request?.url || String(input), 'http://localhost');
    // Authentication and commands must never wait behind background table reads.
    if (method !== 'GET' || !url.pathname.startsWith('/rest/v1/')) return fetcher(input, init);
    const signal = init?.signal || request?.signal;
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const task = { run: () => fetcher(input, init), resolve, reject, signal };
      task.abort = () => {
        const index = queue.indexOf(task);
        if (index !== -1) queue.splice(index, 1);
        signal.removeEventListener('abort', task.abort);
        reject(signal.reason);
      };
      signal?.addEventListener('abort', task.abort, { once: true });
      queue.push(task);
      drain();
    });
  };
}
