import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

/**
 * Per-uid fixed-window rate limiter backed by Firestore.
 *
 * Why Firestore (not Upstash/in-memory):
 *  - Vercel Functions are stateless and multi-region; an in-memory counter would
 *    only catch a fraction of requests. A real distributed counter is required.
 *  - Firestore lives in the same trust boundary as the rest of the audit pipeline
 *    and needs no new dependency or env var.
 *  - 1 write + 1 read per request is ~$0.002 per 1k requests — negligible vs. the
 *    abuse cost it prevents (audit log noise + log-storage growth).
 *
 * Window strategy: fixed-window (per calendar minute). A burst at the window
 * boundary can briefly allow up to 2×limit, which is acceptable for an audit-log
 * abuse defense — the goal is "no one can flood thousands of events", not
 * cryptographic precision.
 *
 * Cleanup: each call writes `expiresAt = now + 2*window`. If the operator
 * enables a Firestore TTL policy on `rateLimits.expiresAt`, old buckets are
 * auto-deleted. Without the policy, stale docs are inert (different doc ID per
 * minute, never queried) so they cost only storage.
 *
 * Storage rule: clients never read/write `rateLimits/*` — see firestore.rules.
 */

const COLLECTION = 'rateLimits';

export interface RateLimitConfig {
  /** Logical bucket name. Different endpoints use different scopes to avoid cross-contamination. */
  scope: string;
  /** Window length in ms. */
  windowMs: number;
  /** Max requests allowed inside one window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Current count after this request (post-increment). */
  count: number;
  /** Unix epoch (ms) when the current window resets. */
  resetAt: number;
}

/**
 * Atomically increment the per-uid counter for the current window and return
 * whether the request is allowed. Errors are propagated — callers may choose to
 * fail-open (allow on error) so a Firestore outage doesn't take down the
 * endpoint.
 */
export async function checkRateLimit(
  uid: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = Math.floor(now / cfg.windowMs);
  const resetAt = (bucket + 1) * cfg.windowMs;
  const docId = `${cfg.scope}_${uid}_${bucket}`;
  const docRef = adminDb().collection(COLLECTION).doc(docId);

  await docRef.set(
    {
      count: FieldValue.increment(1),
      expiresAt: Timestamp.fromMillis(now + 2 * cfg.windowMs),
    },
    { merge: true },
  );
  const snap = await docRef.get();
  const count = (snap.data()?.count as number | undefined) ?? 0;

  return { allowed: count <= cfg.max, count, resetAt };
}
