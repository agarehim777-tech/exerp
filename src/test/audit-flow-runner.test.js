// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { runBoundedFlow } from '../../scripts/audit-flow-runner.mjs';

afterEach(() => vi.useRealTimers());
it('clears the deadline and cleans up successful flows', async () => {
  vi.useFakeTimers();
  const cleanup = vi.fn();
  await expect(runBoundedFlow(() => 42, 100, cleanup)).resolves.toBe(42);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('cleans up timed-out and rejected flows', async () => {
  vi.useFakeTimers();
  const cleanup = vi.fn();
  const pending = expect(runBoundedFlow(() => new Promise(() => {}), 100, cleanup)).rejects.toThrow('Flow exceeded');
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(cleanup).toHaveBeenCalledOnce();
  await expect(runBoundedFlow(() => { throw new Error('failure'); }, 100, cleanup)).rejects.toThrow('failure');
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
