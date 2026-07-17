"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";
interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}
interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const value = useMemo<ToastContextValue>(
    () => ({
      showToast: (message, tone = "info") =>
        setToast({ id: Date.now(), message, tone }),
    }),
    [],
  );

  useEffect(() => {
    const handleExpired = () => {
      queryClient.clear();
      if (!location.pathname.startsWith("/login")) {
        location.assign("/login?expired=1");
      }
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={value}>
        {children}
        {toast && (
          <div
            role="status"
            className={`fixed right-6 top-20 z-[100] rounded-xl border px-4 py-3 text-xs shadow-xl ${
              toast.tone === "error"
                ? "border-[#E7C8C4] bg-[#FFF7F6] text-[#9A463D]"
                : toast.tone === "success"
                  ? "border-[#C9DED0] bg-[#F4FAF6] text-[var(--success)]"
                  : "border-[var(--border)] bg-white text-[var(--navy)]"
            }`}
          >
            {toast.message}
          </div>
        )}
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within AppProviders");
  return context;
}
