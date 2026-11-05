"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** POSTs JSON to an API route, then refreshes the server-rendered page. */
export function ActionButton({
  url,
  body,
  children,
  confirm,
  className = "btn-secondary btn-sm",
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
      {error && <span className="max-w-xs text-xs text-rose-600">{error}</span>}
    </span>
  );
}
