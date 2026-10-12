export type MemoryRole = 'user' | 'assistant' | 'system' | 'tool';

export type MemoryMessage = {
  role: MemoryRole;
  content: string;
  createdAt?: string;
};

export type RecentEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  streamId?: string;
};

export interface MemoryStore {
    readonly kind: 'iris' | 'redis-fallback';

  appendMessages(projectId: string, messages: MemoryMessage[]): Promise<void>;

  getSessionHistory(projectId: string, limit: number): Promise<MemoryMessage[]>;

  clearSession(projectId: string): Promise<void>;

  appendEvents(projectId: string, events: RecentEvent[]): Promise<void>;

  recentEvents(projectId: string, limit: number): Promise<RecentEvent[]>;
}
