"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (currentUser.isError) router.replace("/login?expired=1");
  }, [currentUser.isError, router]);

  if (currentUser.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)]">
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--champagne)] border-t-[var(--navy)]" />
          正在验证登录状态…
        </div>
      </div>
    );
  }
  if (!currentUser.data) return null;
  return children;
}
