import { expect, it, vi } from 'vitest';
import { createExpenseCommand, financeRpcError } from '../services/financeLedger';

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
