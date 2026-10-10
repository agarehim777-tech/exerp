// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { limitSupabaseReads } from '../shared/lib/limitSupabaseReads.js';

const tick = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

it('bounds table reads, preserves every result and leaves commands and authentication unqueued', async () => {
  const finishes = [];
  const started = [];
  const fetcher = vi.fn((input, init) => {
    started.push([input, init]);
    if (String(input).includes('/rest/v1/') && !init?.method) return new Promise(resolve => finishes.push(resolve));
    return Promise.resolve('command');
  });
  const fetch = limitSupabaseReads(fetcher, 2);
  const headers = { authorization: 'Bearer test-only' };
  const reads = [1, 2, 3, 4].map(id => fetch(`https://test.invalid/rest/v1/rows?id=eq.${id}`, { headers }));
  await tick();
  expect(started).toHaveLength(2);
  expect(await fetch('https://test.invalid/rest/v1/rpc/command', { method: 'POST' })).toBe('command');
  expect(await fetch('https://test.invalid/auth/v1/user')).toBe('command');
  expect(started).toHaveLength(4);
  finishes[0]('one'); finishes[1]('two'); await tick();
  expect(started).toHaveLength(6);
  finishes[2]('three'); finishes[3]('four');
  expect(await Promise.all(reads)).toEqual(['one', 'two', 'three', 'four']);
  expect(started.filter(([url]) => url.includes('/rows')).every(([, init]) => init.headers === headers)).toBe(true);
});

it('does not send aborted queued requests and releases slots after failed reads', async () => {
  let fail;
  const fetcher = vi.fn(() => fetcher.mock.calls.length === 1 ? new Promise((resolve, reject) => { fail = reject; }) : Promise.resolve('ok'));
  const fetch = limitSupabaseReads(fetcher, 1);
  const first = fetch('https://test.invalid/rest/v1/first');
  const firstFailure = expect(first).rejects.toThrow('offline');
  const controller = new AbortController();
  const aborted = fetch('https://test.invalid/rest/v1/aborted', { signal: controller.signal });
  const abortFailure = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  const last = fetch(new Request('https://test.invalid/rest/v1/last'));
  await tick(); controller.abort(); await abortFailure;
  fail(new Error('offline')); await firstFailure;
  expect(await last).toBe('ok');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[0][0])).toContain('/first');
  expect(fetcher.mock.calls[1][0].url).toContain('/last');
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await expect(fetch('https://test.invalid/rest/v1/never', { signal: alreadyAborted.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rejects invalid read limits', () => {
  for (const limit of [0, -1, 1.5, NaN]) expect(() => limitSupabaseReads(vi.fn(), limit)).toThrow('concurrency');
});
