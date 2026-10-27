"use client";

// زنون ۱ — نشانگر سلامت اتصال
// هر ۲۵ ثانیه /api/health را بررسی می‌کند و با رخدادهای online/offline مرورگر همگام است.
// هدف: کاربر همیشه وضعیت اتصال را می‌بیند و دیگر خطاهای خام شبکه را تجربه نمی‌کند.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "./locale-provider";

type ConnState = "online" | "offline" | "checking";

export function ConnectionBadge({ className }: { className?: string }) {
  const t = useT();
  const [state, setState] = useState<ConnState>("checking");

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const probe = async () => {
      const controller = new AbortController();
      const killer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
        if (!disposed) setState(res.ok ? "online" : "offline");
      } catch {
        if (!disposed) setState("offline");
      } finally {
        clearTimeout(killer);
        if (!disposed) timer = setTimeout(probe, 25_000);
      }
    };

    const goOffline = () => {
      if (!disposed) setState("offline");
    };
    const goOnline = () => {
      if (!disposed) {
        setState("checking");
        probe();
      }
    };

    probe();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const label =
    state === "online" ? t("conn.online") : state === "offline" ? t("conn.offline") : t("conn.checking");

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[0.7rem] text-muted-foreground", className)}
      role="status"
      aria-live="polite"
      title={label}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "online" && "bg-emerald-500",
          state === "checking" && "animate-pulse bg-amber-500",
          state === "offline" && "bg-destructive"
        )}
        aria-hidden
      />
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}
