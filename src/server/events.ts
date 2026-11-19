import { Response } from 'express';

export interface StreamEvent {
  type: 'break_created' | 'break_updated' | 'break_completed' | 'chat_message' | 'notification' | 'community_updated';
  communityId?: string;
  conversationId?: string;
  userId?: string;
  payload: unknown;
  timestamp: number;
}

interface Subscriber {
  id: string;
  res: Response;
  communityId?: string;
  userId?: string;
}

class RealtimeEventBus {
  private subscribers = new Map<string, Subscriber>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.heartbeatTimer = setInterval(() => {
      for (const sub of this.subscribers.values()) {
        try {
          sub.res.write(': ping\n\n');
        } catch {
          this.subscribers.delete(sub.id);
        }
      }
    }, 25_000);
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  subscribe(res: Response, opts: { communityId?: string; userId?: string }): () => void {
    const id = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering for SSE
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ id, timestamp: Date.now() })}\n\n`);

    this.subscribers.set(id, {
      id,
      res,
      communityId: opts.communityId,
      userId: opts.userId,
    });

    return () => {
      this.subscribers.delete(id);
    };
  }

  publish(event: StreamEvent): void {
    const serialized = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const sub of this.subscribers.values()) {
      // Filter by communityId if subscriber specified one and event carries one
      if (event.communityId && sub.communityId && event.communityId !== sub.communityId) {
        continue;
      }
      // Target private notifications when userId is specified (excluding 'all')
      if (event.userId && event.userId !== 'all' && event.userId !== 'admin' && sub.userId !== event.userId) {
        continue;
      }
      try {
        sub.res.write(serialized);
      } catch {
        this.subscribers.delete(sub.id);
      }
    }
  }

  getConnectionCount(): number {
    return this.subscribers.size;
  }
}

export const eventBus = new RealtimeEventBus();
