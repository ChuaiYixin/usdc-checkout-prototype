"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// R6: dashboards re-render from the server every few seconds (well inside the 5 s requirement).
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
