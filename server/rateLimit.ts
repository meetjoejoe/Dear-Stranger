import crypto from 'node:crypto';
import type { Request } from 'express';
import { getServerConfig } from './config.ts';

interface Bucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, Bucket>();
const duplicateGuard = new Map<string, number>();

// Cleanup stale entries periodically (max retention 15 minutes, zero raw IP persistence)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    const recent = bucket.timestamps.filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length === 0) {
      rateBuckets.delete(key);
    } else {
      bucket.timestamps = recent;
    }
  }
  for (const [key, expiresAt] of duplicateGuard.entries()) {
    if (expiresAt < now) {
      duplicateGuard.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function hashRequestActor(req: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const cfg = getServerConfig();
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ||
    req.socket.remoteAddress ||
    'unknown';
  const digest = crypto
    .createHmac('sha256', cfg.rateLimitSalt)
    .update(rawIp.trim())
    .digest('hex')
    .slice(0, 24);
  return `ip:${digest}`;
}

export function checkRateLimit(
  scope: string,
  actorKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = `${scope}:${actorKey}`;
  const bucket = rateBuckets.get(key) || { timestamps: [] };
  const recent = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    bucket.timestamps = recent;
    rateBuckets.set(key, bucket);
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  bucket.timestamps = recent;
  rateBuckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

export function checkAndMarkDuplicate(
  actorKey: string,
  actionScope: string,
  content: string,
  ttlMs = 60_000
): boolean {
  const now = Date.now();
  const hash = crypto
    .createHash('sha256')
    .update(`${actorKey}:${actionScope}:${content.trim().toLowerCase()}`)
    .digest('hex');
  const existingExpiry = duplicateGuard.get(hash);
  if (existingExpiry && existingExpiry > now) {
    return true; // Duplicate detected
  }
  duplicateGuard.set(hash, now + ttlMs);
  return false;
}

export function resetRateLimitsForTest(): void {
  rateBuckets.clear();
  duplicateGuard.clear();
}
