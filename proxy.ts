import { NextRequest, NextResponse } from 'next/server';

/**
 * Build a Content-Security-Policy string with a per-request nonce.
 *
 * Why nonce + 'strict-dynamic':
 * - 'unsafe-inline' was a temporary allowance for the theme boot script in
 *   app/layout.tsx (anti-FOUC). Nonce removes that allowance entirely.
 * - 'strict-dynamic' lets nonce-tagged scripts load further trusted scripts
 *   (Next.js framework chunks) without per-host whitelisting.
 *
 * Note: style-src still requires 'unsafe-inline' due to Next.js inline
 * style hydration. Nonce-based style policies are tracked separately.
 */
function buildCsp(nonce: string): string {
  // React dev-mode reconstructs callstacks via eval(); allow only in dev.
  // Production builds never call eval(), so 'unsafe-eval' stays out.
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://firebasestorage.googleapis.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    "frame-src https://*.firebaseapp.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function proxy(request: NextRequest) {
  // Per-request nonce. 16 random bytes -> base64 (~22 chars).
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Buffer.from(nonceBytes).toString('base64');

  const csp = buildCsp(nonce);

  // Forward nonce to RSC via request header so layout can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Emit CSP on the response so the browser enforces it.
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  // Skip static assets and image optimizer; CSP only matters for HTML/RSC.
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.gif|.*\\.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

// Note: Proxy always runs on Node.js runtime in Next.js 16; runtime export not allowed.
