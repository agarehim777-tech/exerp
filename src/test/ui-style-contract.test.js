// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { expect, it } from 'vitest';

const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.css') ? [path.join(dir, entry.name)] : []);

it('keeps application styles on four breakpoints and a minimum 11px font size', () => {
  const widths = new Set();
  const undersized = [];
  for (const file of files('src')) {
    const root = postcss.parse(fs.readFileSync(file, 'utf8'));
    root.walkAtRules('media', rule => {
      for (const match of rule.params.matchAll(/(?:min|max)-width:\s*(\d+)px/g)) widths.add(Number(match[1]));
    });
    root.walkDecls('font-size', declaration => {
      if (/^[\d.]+px$/.test(declaration.value) && parseFloat(declaration.value) < 11) undersized.push(`${file}: ${declaration.value}`);
    });
  }
  expect([...widths].sort((a,b)=>a-b)).toEqual([640,900,1180,1440]);
  expect(undersized).toEqual([]);
});

it('retains only one unconditional legacy base rule for each shared component', () => {
  const counts = { '.panel':0, '.metric-card':0, '.primary-btn':0 };
  for (const file of files('src/styles/legacy')) {
    const root = postcss.parse(fs.readFileSync(file, 'utf8'));
    for (const node of root.nodes) if (node.type === 'rule' && node.selector in counts) counts[node.selector]++;
  }
  expect(counts).toEqual({ '.panel':1, '.metric-card':1, '.primary-btn':1 });
});
