import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import HrPage from '../pages/HrPage.jsx';
import { HrStructureBuilder } from '../shared/lib/appDomain.jsx';

const employees = [
  { id: 'employee-a', name: 'Same Name', position: 'Analyst', department: 'Finance', salary: 1000 },
  { id: 'employee-b', name: 'Same Name', position: 'Engineer', department: 'Operations', salary: 2000 },
];

it('selects and edits the intended employee despite an identical display name', () => {
  const edit = vi.fn();
  const { container } = render(<HrPage employees={employees} onEditEmployee={edit} onDeleteEmployee={vi.fn()} onUpdateEmployeeStructure={vi.fn()} />);
  fireEvent.click(container.querySelectorAll('.hr-person-row')[1]);
  expect(container.querySelector('.hr-profile-head').textContent).toContain('Engineer');
  fireEvent.click(container.querySelector('.hr-profile-edit'));
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: 'employee-b' }));
  expect(container.querySelector('.hr-builder-form select').value).toBe('employee-b');
});

it('saves structure and manager foreign keys rather than ambiguous names', () => {
  const update = vi.fn();
  const { container, getByLabelText } = render(<HrStructureBuilder employees={employees}
    selectedEmployee={employees[1]} onSelectEmployee={vi.fn()} onUpdate={update} />);
  fireEvent.change(getByLabelText('Kimə tabedir'), { target: { value: 'employee-a' } });
  fireEvent.submit(container.querySelector('form'));
  expect(update).toHaveBeenCalledWith('employee-b', expect.objectContaining({ managerId: 'employee-a', managerName: 'Same Name' }));
});
