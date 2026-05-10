'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Renders nothing on the server. After hydration, if the user is signed in,
 * replaces the route with /today. Anonymous visitors keep seeing the
 * marketing surface.
 */
export function AuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/today');
  }, [user, loading, router]);

  return null;
}
