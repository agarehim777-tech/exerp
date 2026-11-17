import { expect, it, vi } from 'vitest';
import { findAuthUserByEmail } from '../../supabase/functions/_shared/findAuthUser.ts';

it('finds an existing account beyond the first page, including server-capped pages', async () => {
  const list = vi.fn()
    .mockResolvedValueOnce({ data: { users: [{ id: 'a', email: 'a@example.com' }] }, error: null })
    .mockResolvedValueOnce({ data: { users: [{ id: 'b', email: 'B@example.com' }] }, error: null });
  expect(await findAuthUserByEmail(list, ' b@example.com ')).toEqual({ id: 'b', email: 'B@example.com' });
  expect(list).toHaveBeenLastCalledWith({ page: 2, perPage: 200 });
});

it('only treats a successful empty page as account absence', async () => {
  const list = vi.fn().mockResolvedValue({ data: { users: [] }, error: null });
  expect(await findAuthUserByEmail(list, 'a@example.com')).toBeNull();
});

it('fails closed on an auth API error instead of attempting to create another user', async () => {
  const list = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(findAuthUserByEmail(list, 'a@example.com')).rejects.toThrow('Unable to read auth users');
});

it('rejects a repeated page rather than looping indefinitely', async () => {
  const list = vi.fn().mockResolvedValue({ data: { users: [{ id: 'a' }] }, error: null });
  await expect(findAuthUserByEmail(list, 'b@example.com')).rejects.toThrow('did not advance');
  expect(list).toHaveBeenCalledTimes(2);
});
