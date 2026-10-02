import { describe, it, expect, vi } from 'vitest';
import { onceSuccessful } from '../../src/once.js';

describe('onceSuccessful', () => {
  it('runs a successful initializer once and reuses its result', async () => {
    const init = vi.fn(async () => ({ ready: true }));
    const once = onceSuccessful(init);

    const [a, b, c] = await Promise.all([once(), once(), once()]);

    expect(init).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ready: true });
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(await once()).toBe(a);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('clears a failed attempt so a later request can retry', async () => {
    const init = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('ready');
    const once = onceSuccessful(init);

    await expect(once()).rejects.toThrow('temporary failure');
    await expect(once()).resolves.toBe('ready');
    await expect(once()).resolves.toBe('ready');
    expect(init).toHaveBeenCalledTimes(2);
  });
});
