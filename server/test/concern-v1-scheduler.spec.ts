import { describe, expect, it } from 'vitest';

import { ConcernShadowScheduler } from '../src/scan/concern-v1/scheduler';

describe('concern v1 shadow scheduler', () => {
  it('bounds active and queued work and hands a released slot to the next run', async () => {
    const scheduler = new ConcernShadowScheduler(1, 1, 1_000);
    const firstRelease = await scheduler.acquire();
    expect(firstRelease).toBeTypeOf('function');

    const secondSlot = scheduler.acquire();
    await expect(scheduler.acquire()).resolves.toBeNull();
    firstRelease?.();

    const secondRelease = await secondSlot;
    expect(secondRelease).toBeTypeOf('function');
    secondRelease?.();
    secondRelease?.();
    await expect(scheduler.acquire()).resolves.toBeTypeOf('function');
  });

  it('drops observational work that waits beyond the queue deadline', async () => {
    const scheduler = new ConcernShadowScheduler(1, 1, 5);
    const release = await scheduler.acquire();
    await expect(scheduler.acquire()).resolves.toBeNull();
    release?.();
  });
});
