import { expect, it, vi } from 'vitest';
import { createExpenseCommand, createExpenseEditCommand, financeRpcError } from '../services/financeLedger';

const payload = { account_id: 'a', amount: 10, expense_date: '2026-09-23' };
it('deduplicates double clicks and preserves the key after uncertain failure', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error: { message: 'network error' } }).mockResolvedValue({ data: { expense_id: 'e' } });
  const command = createExpenseCommand('tenant', rpc);
  const first = command(payload);
  expect(command(payload)).toBe(first);
  await expect(first).rejects.toMatchObject({ message: 'network error' });
  await command(payload);
  expect(rpc.mock.calls[0][1]._request_key).toBe(rpc.mock.calls[1][1]._request_key);
  await command(payload);
  expect(rpc.mock.calls[2][1]._request_key).not.toBe(rpc.mock.calls[1][1]._request_key);
  expect(rpc.mock.calls[0][1]._tenant_id).toBe('tenant');
});
it('reports missing migration without falling back to client posting', () => {
  expect(financeRpcError({ code: 'PGRST202' }).code).toBe('ERP_SCHEMA_MIGRATION_REQUIRED');
});

it('sends the persisted expense version to the atomic edit command', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { expense_id: 'e' } });
  await createExpenseEditCommand('tenant',rpc)({ expense: { id:'e',account_id:'a',amount:'10.25',vat_amount:'0',
    currency:'AZN',category:'ops',description:'before',expense_date:'2026-09-23' }, ...payload, amount:'12.50' });
  expect(rpc.mock.calls[0][0]).toBe('edit_cash_expense_atomic');
  expect(rpc.mock.calls[0][1]._payload).toMatchObject({ expense_id:'e',amount:12.5,expected:{amount:10.25,description:'before'} });
});
