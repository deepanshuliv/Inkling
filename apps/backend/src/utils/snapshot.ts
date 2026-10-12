import { prisma } from '@repo/db';
import { ensureSeqAtLeast } from '@repo/redis';
import { envInt } from '@repo/shared';
import { deleteObject, getObject, isStorageConfigured, putObject, snapshotKey } from '@repo/storage';
import { executeCommand, type ProjectSandbox } from '../sandbox';

const ARCHIVE_PATH = '/tmp/project-snapshot.tar.gz';

export const SNAPSHOT_KEEP = Math.max(1, envInt('SNAPSHOT_KEEP', 3));

export type SnapshotInfo = {
  r2Key: string;
  upToSeq: number;
  sizeBytes: number;
};

async function latestSnapshot(projectId: string) {
  return await prisma.snapshot.findFirst({
    where: { projectId },
    orderBy: { upToSeq: 'desc' },
  });
}

export async function lastSnapshotSeq(projectId: string): Promise<number> {
  return (await latestSnapshot(projectId))?.upToSeq ?? 0;
}

export async function writeSnapshot(
  entry: ProjectSandbox,
  upToSeq: number,
): Promise<SnapshotInfo | null> {
  if (!isStorageConfigured()) {
    console.log('[SNAPSHOT] R2 not configured, skipping');
    return null;
  }

  const tar = await executeCommand(
    entry.projectId,
    `tar -czf ${ARCHIVE_PATH} --exclude=node_modules --exclude=.next -C ${entry.rootDir} .`,
  );
  if (tar.exitCode !== 0) {
    console.log('[SNAPSHOT_TAR_FAILED] , ', tar.output.slice(-1000));
    return null;
  }

  const bytes = await entry.sandbox.fs.downloadFile(ARCHIVE_PATH);
  const key = snapshotKey(entry.projectId, upToSeq);
  const sizeBytes = await putObject(key, bytes);

  await prisma.snapshot.create({
    data: { projectId: entry.projectId, r2Key: key, upToSeq, sizeBytes },
  });

  console.log(`[SNAPSHOT] wrote ${key} (${sizeBytes} bytes) at seq ${upToSeq}`);

  await pruneSnapshots(entry.projectId).catch((error) => {
    console.log('[SNAPSHOT_PRUNE_FAILED] , ', String(error).slice(0, 200));
  });

  return { r2Key: key, upToSeq, sizeBytes };
}

export async function pruneSnapshots(projectId: string, keep = SNAPSHOT_KEEP): Promise<number> {
  if (!isStorageConfigured()) return 0;

  const snapshots = await prisma.snapshot.findMany({
    where: { projectId },
    orderBy: { upToSeq: 'desc' },
    select: { id: true, r2Key: true },
  });
  const keptKeys = new Set(snapshots.slice(0, keep).map((snapshot) => snapshot.r2Key));

  let removed = 0;
  for (const snapshot of snapshots.slice(keep)) {
    try {
      if (!keptKeys.has(snapshot.r2Key)) await deleteObject(snapshot.r2Key);
      await prisma.snapshot.delete({ where: { id: snapshot.id } });
      removed++;
    } catch (error) {
      console.log('[SNAPSHOT_DELETE_FAILED] , ', snapshot.r2Key, String(error).slice(0, 160));
    }
  }
  return removed;
}

export async function deleteSnapshotObjects(projectId: string): Promise<void> {
  if (!isStorageConfigured()) return;

  const snapshots = await prisma.snapshot.findMany({ where: { projectId }, select: { r2Key: true } });
  for (const snapshot of snapshots) {
    await deleteObject(snapshot.r2Key).catch((error) => {
      console.log('[SNAPSHOT_DELETE_FAILED] , ', snapshot.r2Key, String(error).slice(0, 160));
    });
  }
}

export async function restoreSnapshot(entry: ProjectSandbox): Promise<number | null> {
  if (!isStorageConfigured()) return null;

  const snapshot = await latestSnapshot(entry.projectId).catch((error) => {
    console.log('[SNAPSHOT_LOOKUP_FAILED] , ', String(error).slice(0, 160));
    return null;
  });
  if (!snapshot) return null;

  let bytes: Buffer;
  try {
    bytes = await getObject(snapshot.r2Key);
  } catch (error) {
    console.log('[SNAPSHOT_FETCH_FAILED] , ', snapshot.r2Key, String(error).slice(0, 200));
    return null;
  }

  await entry.sandbox.fs.createFolder(entry.rootDir, '755').catch(() => undefined);
  await entry.sandbox.fs.uploadFile(bytes, ARCHIVE_PATH);

  const untar = await executeCommand(
    entry.projectId,
    `tar -xzf ${ARCHIVE_PATH} -C ${entry.rootDir}`,
  );
  if (untar.exitCode !== 0) {
    console.log('[SNAPSHOT_UNTAR_FAILED] , ', untar.output.slice(-1000));
    return null;
  }

  const install = await executeCommand(entry.projectId, 'npm install --no-audit --no-fund');
  if (install.exitCode !== 0) {
    console.log('[SNAPSHOT_INSTALL_FAILED] , ', install.output.slice(-1000));
  }

  await ensureSeqAtLeast(entry.projectId, snapshot.upToSeq);

  console.log(`[SNAPSHOT] restored ${snapshot.r2Key}, replaying from seq > ${snapshot.upToSeq}`);
  return snapshot.upToSeq;
}
