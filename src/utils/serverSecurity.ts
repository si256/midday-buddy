export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();

  check(key: string, maxRequests: number, windowMs: number, now = Date.now()): RateLimitDecision {
    const windowStart = now - windowMs;
    const timestamps = (this.buckets.get(key) || []).filter((ts) => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(1000, oldest + windowMs - now);
      this.buckets.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
      };
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);

    // Occasional cleanup if buckets grow large
    if (this.buckets.size > 5000) {
      for (const [k, vals] of this.buckets.entries()) {
        const fresh = vals.filter((ts) => ts > windowStart);
        if (fresh.length === 0) {
          this.buckets.delete(k);
        } else {
          this.buckets.set(k, fresh);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - timestamps.length),
      retryAfterMs: 0,
    };
  }
}

/**
 * Validates external Slack/Teams/Discord webhook URLs while blocking SSRF internal targets.
 */
export function isValidWebhookUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 50,
  maxLimit = 100
): { limit: number; offset: number; page: number } {
  const rawLimit = Number(query.limit);
  const rawPage = Number(query.page);

  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), maxLimit)
    : defaultLimit;

  const page = Number.isFinite(rawPage) && rawPage > 0
    ? Math.floor(rawPage)
    : 1;

  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
}
