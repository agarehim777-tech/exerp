import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const ops = vi.hoisted(() => ({
  employees: [{ id: 'e', full_name: 'Employee', salary: 1000 }],
  byType: { attendance: [], payroll: [], leave: [] },
  loading: false, error: null, createEvent: vi.fn(),
}));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: 'A' }) }));
vi.mock('../shared/hooks/useHrOperations.js', () => ({ useHrOperations: () => ops }));
import HrOperationsPanel from '../modules/hr/HrOperationsPanel.jsx';
beforeEach(() => { ops.byType.attendance = []; ops.loading = false; ops.error = null; });
it('blocks payroll closure when attendance is missing', () => {
  render(<HrOperationsPanel controlledTab="payroll" />);
  expect(screen.getByRole('button', { name: 'Davamiyyət yoxdur' })).toBeDisabled();
  expect(ops.createEvent).not.toHaveBeenCalled();
});
