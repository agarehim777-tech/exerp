import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const width of [1440, 375]) {
  test(`wide HR structure scrolls without hiding department actions at ${width}px`, async ({ page }) => {
    const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    await page.setViewportSize({ width, height: 800 });
    // Exercise the real chart classes with a tree wider than its containing module.
    const branches = Array.from({ length: 8 }, (_, index) => `<div class="hr-org-branch has-children">
      <button class="hr-org-card" onclick="this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')!=='true')"
        aria-expanded="false">Department ${index + 1}</button>
      <div class="hr-org-children"><div class="hr-org-branch"><button class="hr-org-card">Team ${index + 1}</button></div></div>
    </div>`).join('');
    await page.setContent(`<style>${css}</style><style>
      body{margin:0}.layout-fixture{display:grid;grid-template-columns:240px minmax(0,1fr)}
      .fixture-sidebar{background:#064e3b;min-height:800px}.fixture-main{min-width:0;padding:20px}
      @media(max-width:760px){.layout-fixture{grid-template-columns:minmax(0,1fr)}.fixture-sidebar{display:none}}
    </style><div class="layout-fixture"><aside class="fixture-sidebar">Navigation</aside><main class="fixture-main">
      <section class="hr-tree-panel"><div class="hr-tree"><div class="hr-org-chart-scroll"><div class="hr-org-chart-canvas">
        <button class="hr-org-company-card">Company</button><div class="hr-org-children hr-org-root-children multiple">${branches}</div>
      </div></div></div></section></main></div>`);
    for (const name of ['Department 1', 'Department 8']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(width > 760 ? 240 : 0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/hr-structure-${width}.png` });
  });
}
