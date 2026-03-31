import { Injectable } from '@nestjs/common';

interface AttemptRecord {
  failures: number;
  resetAt: number;
}

/**
 * Tracks failed login attempts per identity key.
 * Increments only on authentication failure — successful logins never count.
 * Uses in-memory storage (acceptable for single-instance; swap for Redis for clustered deployments).
 */
@Injectable()
export class LoginAttemptTracker {
  private readonly store = new Map<string, AttemptRecord>();

  /** Returns true if the key has exceeded its failure limit and is still within the TTL window. */
  isBlocked(key: string, limit: number): boolean {
    const record = this.store.get(key);
    if (!record) return false;
    if (Date.now() > record.resetAt) {
      this.store.delete(key);
      return false;
    }
    return record.failures >= limit;
  }

  /**
   * Record a failed attempt.
   * @returns true if this failure pushes the key over the limit (caller should return 429).
   */
  recordFailure(key: string, limit: number, ttlMs: number): boolean {
    const now = Date.now();
    const existing = this.store.get(key);
    const record: AttemptRecord =
      !existing || now > existing.resetAt
        ? { failures: 0, resetAt: now + ttlMs }
        : { ...existing };

    record.failures += 1;
    this.store.set(key, record);

    return record.failures >= limit;
  }

  /** Called on successful authentication so the counter is cleared immediately. */
  reset(key: string): void {
    this.store.delete(key);
  }
}
