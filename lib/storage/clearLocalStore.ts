/**
 * Wipe device-local state owned by this app before a different user can take
 * over the browser. Called from the account-deletion finalize path.
 *
 * What we clear:
 *  - All `sd:*` keys in `localStorage` and `sessionStorage` (drafts, hints,
 *    onboarding counters that use the canonical prefix).
 *  - Legacy keys that predate the `sd:` convention but still gate first-time
 *    UX. If left behind, a fresh user signing up on the same device would
 *    miss the onboarding hints intended for them.
 *
 * What we DON'T clear:
 *  - `skin-diary:theme` — device-level preference (which OS theme to honor),
 *    not user-owned content. Wiping it would force the next person to redo
 *    a setting they didn't choose.
 *
 * Why this helper is narrow (not called on every signOut):
 *  - Normal sign-out should preserve drafts — a user signing out on phone A
 *    expects their in-progress entry to still be there when they reopen.
 *  - Deletion is the only event where the user has explicitly chosen "remove
 *    everything about me from this device".
 *
 * Storage exceptions (quota, private mode, disabled storage) are swallowed —
 * we never want a cleanup failure to block the deletion success toast.
 */

/**
 * Legacy keys that should have been `sd:*` from the start but already shipped.
 * Rename is intentionally deferred — would require a migration path to avoid
 * stale dismissals coming back to life for existing users. Until then, this
 * list ensures account deletion still wipes them.
 *
 * If you add a new flag, prefer `sd:*` so the prefix sweep above catches it
 * automatically and this list stays small.
 */
const LEGACY_KEYS = ['overviewTipDismissed', 'compare:hintShown'] as const;

export function clearSdLocalStorage(): void {
  if (typeof window === 'undefined') return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith('sd:')) toRemove.push(key);
      }
      for (const key of toRemove) store.removeItem(key);
      for (const key of LEGACY_KEYS) store.removeItem(key);
    } catch {
      /* quota / private mode / disabled — silently skip */
    }
  }
}
