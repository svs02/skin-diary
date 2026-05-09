'use client';

import { BottomTabBar } from '@/components/BottomTabBar';
import { useRequireAuth } from '@/lib/auth/useRequireAuth';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-fg-muted text-sm">…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-6 pt-6">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
