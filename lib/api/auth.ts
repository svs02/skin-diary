import { NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Wrapper helpers for protected Vercel Functions.
 *
 * Why wrappers (CLAUDE.md §10.6 — multi-layer gate):
 *  - Without a global middleware auth gate, every protected route MUST verify
 *    `Authorization: Bearer <ID Token>` itself. Forgetting that check on a new
 *    route would be a silent ownership bypass.
 *  - Centralising the boilerplate in `withAuth` / `withConsent` makes the
 *    check unmistakable at the call site: `export const POST = withAuth(...)`.
 *    Reviewers can grep for any `export async function POST` to find handlers
 *    that didn't go through a wrapper.
 *
 * Response shape:
 *  - 401 { error: 'MISSING_TOKEN' | 'INVALID_TOKEN' } — auth failure
 *  - 403 { error: 'PENDING_CONSENT' }                — sensitive-photo consent missing
 *  - 500 { error: 'CONSENT_CHECK_FAILED' }            — Firestore lookup failure
 *
 * Errors use uniform shapes so reconnaissance can't distinguish between
 * "no such user" and "token revoked".
 */

export interface AuthContext {
  uid: string;
  decoded: DecodedIdToken;
}

export interface ConsentContext extends AuthContext {
  /** Already verified non-null; sensitive-photo consent is recorded. */
  sensitivePhotoVersion: string;
}

type AuthHandler = (req: Request, ctx: AuthContext) => Promise<Response>;
type ConsentHandler = (req: Request, ctx: ConsentContext) => Promise<Response>;

// Auth-related responses must never be cached by browsers or intermediate
// proxies — both the success bodies (which may contain credentials) and the
// failure bodies (which would leak revocation timing) are private.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' } as const;

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function extractBearerToken(req: Request): string | null {
  const header =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Verify a Firebase ID Token (with revoked-check) and pass {uid, decoded} to
 * the handler. Use as the OUTER wrapper for any route that needs an
 * authenticated caller. Wrappers compose: `withConsent(handler)` internally
 * runs through `withAuth`.
 */
export function withAuth(handler: AuthHandler) {
  return async (req: Request): Promise<Response> => {
    const token = extractBearerToken(req);
    if (!token) return jsonError(401, { error: 'MISSING_TOKEN' });
    let decoded: DecodedIdToken;
    try {
      decoded = await adminAuth().verifyIdToken(token, true);
    } catch {
      return jsonError(401, { error: 'INVALID_TOKEN' });
    }
    return handler(req, { uid: decoded.uid, decoded });
  };
}

/**
 * `withAuth` + sensitive-photo consent gate. The single chokepoint for any
 * route that reads or writes user-owned data.
 *
 * Adds one Firestore read per request — acceptable for non-hot paths. The
 * gate field is `users/{uid}.sensitivePhotoVersion`, which matches the
 * existing rules check on signed-url access.
 */
export function withConsent(handler: ConsentHandler) {
  return withAuth(async (req, ctx) => {
    let sensitivePhotoVersion: string | null | undefined;
    try {
      const snap = await adminDb().collection('users').doc(ctx.uid).get();
      sensitivePhotoVersion = snap.exists
        ? (snap.data()?.sensitivePhotoVersion as string | null | undefined)
        : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[withConsent] lookup failed uid=${ctx.uid}: ${message}`);
      return jsonError(500, { error: 'CONSENT_CHECK_FAILED' });
    }
    if (sensitivePhotoVersion == null) {
      return jsonError(403, { error: 'PENDING_CONSENT' });
    }
    return handler(req, { ...ctx, sensitivePhotoVersion });
  });
}
