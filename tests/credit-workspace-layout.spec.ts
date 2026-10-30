import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

for (const width of [1920, 1440, 1180, 900, 640, 375]) {
  test(`credit portfolio fills its workspace without clipped summaries at ${width}px`, async ({ page }) => {
    page.on('pageerror', error => { throw error; });
    await page.route('http://credit-layout.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('http://credit-layout.test/');
    const bundle = await build({ stdin: { contents: '@import "./src/styles.css"; @import "./src/styles/index.css";',
      loader: 'css', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false });
    await page.setViewportSize({ width, height: 1000 });
    const app = await build({ stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {MemoryRouter} from 'react-router-dom';
      import CreditsPage from './src/pages/CreditsPage.jsx';
      const credit = {id:'fixture-credit', customer:'Agarahim Rahimov', contractId:'IN-1006',
        total:20000, amount:20000, months:18, requiredInitial:5000, initialPayment:5000,
        initialPaid:1000, status:'Başlanmamış', date:new Date().toISOString().slice(0,10)};
      createRoot(document.querySelector('main')).render(<MemoryRouter><CreditsPage credits={[credit]} /></MemoryRouter>);
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
      bundle: true, write: false, jsx: 'automatic', format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"VITE_SUPABASE_URL":"http://127.0.0.1:54321","VITE_SUPABASE_PUBLISHABLE_KEY":"layout-test"}' } });
    await page.setContent(`<style>${bundle.outputFiles[0].text}</style><style>
      body{margin:0}.fixture{display:grid;grid-template-columns:240px minmax(0,1fr)}
      .fixture main{min-width:0;padding:20px}.fixture aside{background:#075e4e}
      @media(max-width:900px){.fixture{grid-template-columns:minmax(0,1fr)}.fixture aside{display:none}}
    </style><div class="fixture"><aside></aside><main class="main"></main></div>`);
    await page.addScriptTag({ content: app.outputFiles[0].text });
    await expect(page.getByRole('heading', { name: 'Portfel siyahısı', exact: true })).toBeVisible();
    const workspace = await page.locator('.credit-workspace').boundingBox();
    const metrics = await page.locator('.metric-grid').boundingBox();
    const status = await page.locator('.credit-handover-strip').boundingBox();
    const directory = await page.locator('.credit-directory-panel').boundingBox();
    expect(Math.abs(directory!.width - workspace!.width)).toBeLessThan(2);
    expect(Math.abs(directory!.x - workspace!.x)).toBeLessThan(2);
    expect(status!.y).toBeGreaterThanOrEqual(metrics!.y + metrics!.height);
    expect(directory!.y).toBeGreaterThanOrEqual(status!.y + status!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const clipped = await page.locator('.metric-card strong, .credit-handover-item strong').evaluateAll(nodes =>
      nodes.some(node => node.scrollWidth > node.clientWidth + 1));
    expect(clipped).toBe(false);
    await page.screenshot({ path: `test-results/credit-workspace-${width}.png` });
  });
}
