import { describe, expect, it, vi } from 'vitest';
import { readTenantPage } from '../services/readTenantPage';

describe('bounded tenant reads', () => {
  it('advances by actual rows under a 100-row server cap', async () => {
    const data = Array.from({ length: 603 }, (_, id) => ({ id }));
    const ranges = [];
    const query = () => ({ range: async (start, end) => {
      ranges.push([start, end]);
      return { data: data.slice(start, Math.min(start + 100, end + 1)), count: data.length };
    } });
    const first = await readTenantPage(query, 501, () => true);
    expect(first.data).toEqual(data.slice(0, 501));
    expect(ranges.map(([start]) => start)).toEqual([0, 100, 200, 300, 400, 500]);
    expect((await readTenantPage(query, 1001, () => true)).data).toEqual(data);
  });

  it('does not expose partial data when a later page fails', async () => {
    const error = { message: 'offline' };
    const range = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }], count: 2 })
      .mockResolvedValueOnce({ error });
    expect(await readTenantPage(() => ({ range }), 501, () => true)).toEqual({ data: null, error });
  });

  it('rejects an empty page before the advertised count', async () => {
    expect((await readTenantPage(() => ({ range: async () => ({ data: [], count: 2 }) }), 501, () => true)).error)
      .toBeInstanceOf(Error);
  });

  it('drops responses invalidated by tenant changes', async () => {
    let current = true;
    const result = await readTenantPage(() => ({ range: async () => {
      current = false;
      return { data: [{ id: 'previous-tenant' }], count: 1 };
    } }), 501, () => current);
    expect(result).toBeNull();
  });
});
