import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

// The credit contract modal is narrower than the screen, so screen-width breakpoints never stacked it: at a
// ~900 px modal the left column (history + schedule with 260 + 360 px minimums, four-column tiles) spilled
// under the payment panel. The layout now follows the modal's own width (container queries).
for (const width of [1440, 1180, 980, 900, 768, 375]) {
  test(`credit detail modal keeps its columns apart at ${width}px`, async ({ page }) => {
    page.on('pageerror', error => { throw error; });
    await page.route('http://credit-detail.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.route('http://127.0.0.1:54321/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.goto('http://credit-detail.test/');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const css = await build({ stdin: { contents: '@import "./src/styles.css"; @import "./src/styles/index.css";', loader: 'css', resolveDir: root },
      bundle: true, write: false, loader: { '.ttf': 'dataurl' } });
    await page.setViewportSize({ width, height: 1000 });
    const app = await build({ stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {CreditDetailModal} from './src/modules/credits/components/CreditDetail.tsx';
      const installments = Array.from({length: 12}, (_, i) => ({ month: i + 1, amount: i === 11 ? 57 : 63, due: '2026-' + String((i % 12) + 1).padStart(2, '0') + '-23' }));
      const item = {
        credit: { id: '6cecf2fd-0bf3-47d1-b396-571385a10a5a', customer: 'Məhəmməd Hüseynov', contractId: 'İN-1007', device: 'Sonia G5',
          orderId: 'o-1', orderNo: 'SF-1006', status: 'Aktiv', startedAt: '2026-11-23', paidMonths: 0, initialPaid: 50, requiredInitial: 50,
          payments: [], next: '2026-12-23' },
        plan: { months: 12, monthly: 63, lastPayment: 57, total: 800, balance: 750, initialPayment: 50, installments },
        paymentState: { isOverdue: false, isDueToday: false, daysOverdue: 0, nextInstallment: { amount: 63, due: '2026-12-23' } },
        progress: 0,
      };
      createRoot(document.querySelector('#root')).render(<CreditDetailModal item={item} sendCreditSms={() => {}}
        onUpdatePaymentDate={() => {}} onReceivePayment={async () => true} onOpenSalesOrder={() => {}} onClose={() => {}} />);
    `, loader: 'tsx', resolveDir: root }, bundle: true, write: false, jsx: 'automatic', format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"VITE_SUPABASE_URL":"http://127.0.0.1:54321","VITE_SUPABASE_PUBLISHABLE_KEY":"layout-test"}' } });
    await page.setContent(`<style>${css.outputFiles[0].text}</style><style>body{margin:0}</style><div id="root"></div>`);
    await page.addScriptTag({ content: app.outputFiles[0].text });
    await expect(page.getByRole('heading', { name: 'Məhəmməd Hüseynov' })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const box = (el: Element | null) => el?.getBoundingClientRect();
      const primary = box(document.querySelector('.credit-detail-primary'))!;
      const aside = box(document.querySelector('.credit-detail-aside'));
      // Every block inside the left column must stay inside it.
      const spill = [...document.querySelectorAll('.credit-detail-primary > *, .credit-detail-records > *, .credit-contract-tile, .credit-terms-strip > div')]
        .map(el => ({ name: el.className, right: el.getBoundingClientRect().right }))
        .filter(row => row.right > primary.right + 1);
      const clipped = [...document.querySelectorAll('.credit-contract-snapshot, .credit-terms-strip, .credit-context-grid')]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className);
      return {
        spill, clipped,
        overlap: aside ? !(aside.left >= primary.right - 1 || aside.top >= primary.bottom - 1) : false,
      };
    });
    expect(geometry.spill).toEqual([]);
    expect(geometry.clipped).toEqual([]);
    expect(geometry.overlap).toBe(false);
    await page.screenshot({ path: `test-results/credit-detail-${width}.png`, fullPage: true });
  });
}
