import { describe, expect, it } from 'vitest';
import { canonicalPath, moduleFromPath, pathForModule } from '../config/routes.js';

// The old Faktura, Təchizatçılar and Anbar pages were removed: their ids, URLs and the links that still
// use them (dashboard, notifications, onboarding steps) land on the main pages instead.
describe('retired modules', () => {
  it.each([
    ['invoices', 'ar-invoices', '/maliyye/satis-fakturalari'],
    ['vendors', 'procurement', '/satinalma'],
    ['warehouse', 'stock', '/anbar/qaliqlar'],
  ])('%s opens %s', (retired, target, path) => {
    expect(pathForModule(retired)).toBe(path);
    expect(moduleFromPath(pathForModule(retired))).toBe(target);
  });

  it('redirects the old URLs', () => {
    expect(moduleFromPath('/vendor')).toBe('procurement');
    expect(canonicalPath('/vendor')).toBe('/satinalma');
    expect(moduleFromPath('/faktura')).toBe('ar-invoices');
    expect(moduleFromPath('/fakturalar')).toBe('ar-invoices');
  });
});
