import { describe, expect, it } from 'vitest';
import { permissionForScreen, permissionModuleAliases } from '../config/permissionModules.js';

describe('screen authorization boundaries', () => {
  it.each(Object.entries(permissionModuleAliases))('%s shares the %s server permission', (screen, module) => {
    const permission = { view: true, edit: false };
    expect(permissionForScreen({ [module]: permission }, screen)).toBe(permission);
  });
  it('preserves explicit screen denial without inheriting a broader grant', () => {
    expect(permissionForScreen({ warehouse: { view: true }, stock: { view: false } }, 'stock')).toEqual({ view: false });
  });
  it('fails closed for missing matrices and unknown screens', () => {
    expect(permissionForScreen(null, 'stock')).toBeNull();
    expect(permissionForScreen({ sales: { view: true } }, 'stock')).toBeNull();
    expect(permissionForScreen({ warehouse: { view: true } }, 'unrelated')).toBeNull();
  });
});
