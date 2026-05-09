'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function RootRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/today' : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-fg-muted text-sm">…</span>
    </div>
  );
}
