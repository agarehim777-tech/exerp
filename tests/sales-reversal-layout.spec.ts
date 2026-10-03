import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const width of [1440, 375]) {
  test(`reversal dialog remains above the order drawer at ${width}px`, async ({ page }) => {
    const css = await readFile(new URL('../src/modules/sales/sales-reversal.css', import.meta.url), 'utf8');
    await page.setViewportSize({ width, height: 800 });
    // Isolate the overlay stacking regression without posting a business transaction.
    await page.setContent(`<style>${css}</style>
      <div style="position:fixed;inset:0;z-index:100;background:white">Order drawer</div>
      <div class="reversal-backdrop"><section class="reversal-dialog" role="dialog" style="background:white">
        <header><div><h2>Sales cancellation</h2></div><button>Close</button></header>
        <div class="reversal-impact-grid"><div>Credit<strong>1</strong></div><div>Cash<strong>200 AZN</strong></div></div>
        <label class="reversal-reason">Reason<textarea rows="3"></textarea></label>
        <footer><button onclick="this.textContent='Confirmed'">Confirm cancellation</button></footer>
      </section></div>`);
    await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeVisible();
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/reversal-preview-${width}.png` });
  });
}
