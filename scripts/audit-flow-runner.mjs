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
