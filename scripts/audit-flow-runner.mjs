export async function runBoundedFlow(run, timeoutMs, cleanup) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid audit timeout');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Flow exceeded ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await cleanup();
  }
}
