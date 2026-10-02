// Screen identifiers share the same authorization boundary as their server commands.
export const permissionModuleAliases = {
  stock: 'warehouse', products: 'warehouse', cashbook: 'finance',
  'ar-invoices': 'invoices', 'financial-statements': 'accounting',
  'crm-deals': 'crm', 'crm-activities': 'crm', 'crm-tasks': 'crm',
  'sales-dashboard': 'sales', bonuses: 'sales', audit: 'settings',
  'data-reconciliation': 'settings', 'access-check': 'settings', roles: 'settings',
};

export function permissionForScreen(matrix, screen) {
  if (!matrix) return null;
  // A screen-specific override, including explicit denial, takes precedence.
  return matrix[screen] ?? matrix[permissionModuleAliases[screen]] ?? null;
}
