// ----------------------------------------------------------------------------
// Skin Diary — Vercel Project Configuration
//
// Compiled to vercel.json automatically by `vercel build` / `vercel dev` /
// `vercel deploy`. Do NOT also commit a hand-written vercel.json.
//
// Notes
//   - Framework / build / install commands are pinned so behaviour matches
//     local pnpm in CI and Vercel.
//   - Headers below cover only static assets that browsers fetch repeatedly
//     (icons, manifest). Security headers are emitted from next.config.ts +
//     middleware so the per-request CSP nonce stays intact.
//   - No `crons` defined yet. Add later as a server route + entry here.
// ----------------------------------------------------------------------------

import { routes } from '@vercel/config/v1';
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'pnpm build',
  devCommand: 'pnpm dev',
  installCommand: 'pnpm install --frozen-lockfile',

  headers: [
    // App icons are content-addressed (renamed on change) — safe to cache 1w.
    routes.cacheControl('/icon-(.*)\\.png', {
      public: true,
      maxAge: '1 week',
      immutable: true,
    }),
    routes.cacheControl('/apple-touch-icon\\.png', {
      public: true,
      maxAge: '1 week',
      immutable: true,
    }),
    routes.cacheControl('/favicon(.*)\\.(png|ico|svg)', {
      public: true,
      maxAge: '1 week',
      immutable: true,
    }),
    // Manifest can change with each deploy — short-cache it.
    routes.cacheControl('/manifest\\.webmanifest', {
      public: true,
      maxAge: '24 hours',
    }),
  ],
};

export default config;
