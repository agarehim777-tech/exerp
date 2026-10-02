const transientStatuses = new Set([429, 502, 503, 504]);

// These probes carry no bearer session and cannot commit business commands.
export async function probeBackend(url, options, { fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (!transientStatuses.has(response.status) || attempt === 2) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await sleep(250 * (attempt + 1));
  }
}
