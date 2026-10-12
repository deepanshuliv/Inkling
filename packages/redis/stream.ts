import { redis } from './index';
import { seqKey } from './keys';
import { EVENTS_GROUP, EVENTS_STREAM, makeEvent, type EventType, type ProjectEvent } from '@repo/shared/events';

export async function nextSeq(projectId: string): Promise<number> {
  return await redis.incr(seqKey(projectId));
}

const RAISE_SEQ = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current < tonumber(ARGV[1]) then
  redis.call("SET", KEYS[1], ARGV[1])
end
return 1
`;

export async function ensureSeqAtLeast(projectId: string, seq: number) {
  await redis.eval(RAISE_SEQ, { keys: [seqKey(projectId)], arguments: [String(seq)] });
}

export async function writeEvent(event: ProjectEvent): Promise<string> {
  return await redis.xAdd(EVENTS_STREAM, '*', {
    projectId: event.projectId,
    seq: String(event.seq),
    type: event.type,
    payload: JSON.stringify(event.payload),
    createdAt: event.createdAt,
  });
}

export async function emitEvent(
  projectId: string,
  type: EventType,
  payload: Record<string, unknown>,
): Promise<ProjectEvent & { streamId: string }> {
  const seq = await nextSeq(projectId);
  const event = makeEvent(projectId, seq, type, payload);
  const streamId = await writeEvent(event);
  return { ...event, streamId };
}

export async function ensureConsumerGroup() {
  try {
    await redis.xGroupCreate(EVENTS_STREAM, EVENTS_GROUP, '0', { MKSTREAM: true });
  } catch (error) {
    const message = String(error);
    if (!message.includes('BUSYGROUP')) throw error;
  }
}

function parseStreamId(id: string): [bigint, bigint] {
  const [ms, seq] = id.split('-');
  return [BigInt(ms || '0'), BigInt(seq || '0')];
}

export function minStreamId(ids: string[]): string | null {
  let lowest: string | null = null;
  for (const id of ids) {
    if (!lowest) {
      lowest = id;
      continue;
    }
    const [ms, seq] = parseStreamId(id);
    const [lowMs, lowSeq] = parseStreamId(lowest);
    if (ms < lowMs || (ms === lowMs && seq < lowSeq)) lowest = id;
  }
  return lowest;
}

type GroupInfo = Record<string, unknown>;

export async function trimPersistedEvents(client: typeof redis = redis): Promise<number> {
  const groups = (await client.xInfoGroups(EVENTS_STREAM)) as unknown as GroupInfo[];
  if (groups.length === 0) return 0;

  const floors: string[] = [];
  for (const group of groups) {
    const name = String(group.name);
    const pending = await client.xPending(EVENTS_STREAM, name);
    const floor = pending.pending > 0 && pending.firstId ? String(pending.firstId) : String(group['last-delivered-id'] ?? '0-0');
    floors.push(floor);
  }

  const threshold = minStreamId(floors);
  if (!threshold || threshold === '0-0') return 0;
  return await client.xTrim(EVENTS_STREAM, 'MINID', threshold, { strategyModifier: '~' });
}

export { EVENTS_STREAM, EVENTS_GROUP };
