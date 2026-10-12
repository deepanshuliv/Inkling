import { describe, expect, test } from 'bun:test';
import { createLeases, type LeaseDeps } from './projectLease';

function fakeDeps(acquired = true) {
  const log: string[] = [];
  let lose: (() => void) | null = null;
  const deps: LeaseDeps = {
    newHolder: () => 'backend-1:run',
    acquire: async (projectId, holder) => {
      log.push(`acquire ${projectId} ${holder}`);
      return acquired ? { ok: true, how: 'acquired' } : { ok: false, ownerId: 'backend-2:other' };
    },
    touch: async () => void log.push('touch'),
    clear: async () => void log.push('clear'),
    release: async (_projectId, holder) => void log.push(`release ${holder}`),
    heartbeat: (_projectId, _holder, onLost) => {
      log.push('heartbeat');
      lose = onLost;
      return () => log.push('stop');
    },
  };
  return { deps, log, loseLock: () => lose?.() };
}

describe('project leases', () => {
  test('a held lock is reported with its owner and nothing else happens', async () => {
    const { deps, log } = fakeDeps(false);
    const result = await createLeases(deps)('p1');
    expect(result).toEqual({ ok: false, ownerId: 'backend-2:other' });
    expect(log).toEqual(['acquire p1 backend-1:run']);
  });

  test('releasing an owned lease stops the heartbeat, clears liveness and releases with the same holder once', async () => {
    const { deps, log } = fakeDeps();
    const result = await createLeases(deps)('p1');
    if (!result.ok) throw new Error('expected a lease');
    result.lease.watch(() => {});
    await result.lease.release();
    await result.lease.release();
    expect(log).toEqual(['acquire p1 backend-1:run', 'touch', 'heartbeat', 'stop', 'clear', 'release backend-1:run']);
  });

  test('a lost lease runs the callback and never clears the new owner liveness or lock', async () => {
    const { deps, log, loseLock } = fakeDeps();
    const result = await createLeases(deps)('p1');
    if (!result.ok) throw new Error('expected a lease');
    let lost = 0;
    result.lease.watch(() => void lost++);
    loseLock();
    expect(lost).toBe(1);
    expect(result.lease.owned()).toBe(false);
    await result.lease.release();
    expect(log).toEqual(['acquire p1 backend-1:run', 'touch', 'heartbeat', 'stop']);
  });

  test('watch starts one heartbeat and none after release', async () => {
    const { deps, log } = fakeDeps();
    const result = await createLeases(deps)('p1');
    if (!result.ok) throw new Error('expected a lease');
    result.lease.watch(() => {});
    result.lease.watch(() => {});
    await result.lease.release();
    result.lease.watch(() => {});
    expect(log.filter((entry) => entry === 'heartbeat')).toHaveLength(1);
  });
});
