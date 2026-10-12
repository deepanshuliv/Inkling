import { randomUUIDv7 } from 'bun';
import {
  acquireProjectLock,
  clearLiveness,
  releaseProjectLock,
  startHeartbeat,
  touchLiveness,
  type AcquireResult,
} from '@repo/redis';
import { BACKEND_ID, STRICT_OWNERSHIP } from './config';

export type ProjectLease = {
  holder: string;
  owned: () => boolean;
  watch: (onLost: () => void) => void;
  release: () => Promise<void>;
};

export type LeaseResult = { ok: true; lease: ProjectLease } | { ok: false; ownerId: string };

export type LeaseDeps = {
  newHolder: () => string;
  acquire: (projectId: string, holder: string) => Promise<AcquireResult>;
  touch: (projectId: string) => Promise<void>;
  clear: (projectId: string) => Promise<void>;
  release: (projectId: string, holder: string) => Promise<unknown>;
  heartbeat: (projectId: string, holder: string, onLost: () => void) => () => void;
};

export function createLeases(deps: LeaseDeps) {
  return async function leaseProject(projectId: string): Promise<LeaseResult> {
    const holder = deps.newHolder();
    const lock = await deps.acquire(projectId, holder);
    if (!lock.ok) return { ok: false, ownerId: lock.ownerId };

    await deps.touch(projectId);

    let owned = true;
    let released = false;
    let stopHeartbeat: (() => void) | null = null;

    return {
      ok: true,
      lease: {
        holder,
        owned: () => owned,
        watch(onLost) {
          if (stopHeartbeat || released) return;
          stopHeartbeat = deps.heartbeat(projectId, holder, () => {
            owned = false;
            onLost();
          });
        },
        async release() {
          if (released) return;
          released = true;
          stopHeartbeat?.();
          if (!owned) return;
          await deps.clear(projectId).catch(() => {});
          await deps.release(projectId, holder).catch(() => {});
        },
      },
    };
  };
}

export const leaseProject = createLeases({
  newHolder: () => `${BACKEND_ID}:${randomUUIDv7()}`,
  acquire: (projectId, holder) => acquireProjectLock(projectId, holder, !STRICT_OWNERSHIP),
  touch: touchLiveness,
  clear: clearLiveness,
  release: releaseProjectLock,
  heartbeat: startHeartbeat,
});
