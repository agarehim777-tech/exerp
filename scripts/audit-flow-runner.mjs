export function auditServerArguments(url, env = process.env) {
  return ['node_modules/vite/bin/vite.js', ...(env.CI === 'true' ? ['preview'] : []),
    '--host', url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
    '--port', url.port || '5174', '--strictPort'];
}

export async function createAuditCustomerIdentity(readExisting, randomUUID = () => crypto.randomUUID()) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seed = randomUUID().replaceAll('-', '').toUpperCase();
    const identity = { fin: `Q${seed.slice(0, 6)}`,
      phone: `050${String(BigInt(`0x${seed.slice(-12)}`) % 10000000n).padStart(7, '0')}` };
    if (!(await readExisting(identity)).length) return identity;
  }
  throw new Error('Could not allocate an isolated audit customer identity');
}

export function legacyAuditCompatibilityError(env) {
  if (!env.VITE_SUPABASE_URL?.trim()) return null;
  const error = new Error('Legacy audit uses browser business storage. Supabase scenarios must replace it before release.');
  error.code = 'AUDIT_BACKEND_INCOMPATIBLE';
  return error;
}

export async function waitForAuditModule(page, path, label) {
  await page.waitForURL(url => url.pathname === path);
  await page.locator('.sidebar .nav-list .nav-item.active')
    .getByText(label, { exact: true }).waitFor({ state: 'visible' });
  await page.locator('main.main').waitFor({ state: 'visible' });
  // Realtime and background reads may never become idle. Wait for the module instead.
  await page.locator('main.main .page-suspense-loader').waitFor({ state: 'hidden' });
}

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

export async function auditResponse(page, predicate, action, options) {
  // Attach both rejection handlers before the action can stall or fail.
  const [response] = await Promise.all([
    page.waitForResponse(predicate, options),
    Promise.resolve().then(action),
  ]);
  return response;
}
