"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useT } from "@/i18n/client";

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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("Request failed ({status})", { status: res.status }));
      router.refresh();
    } catch (e) {
      setError(t(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button className={className} disabled={busy} onClick={() => (confirm ? setAsking(true) : run())}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
      {error && <span className="max-w-xs text-xs text-rose-600">{error}</span>}
      {asking &&
        createPortal(
          <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="card w-full max-w-md animate-pop p-6 text-left">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{confirm}</p>
              <div className="mt-6 flex justify-end gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setAsking(false)}>
                  {t("Cancel")}
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => {
                    setAsking(false);
                    run();
                  }}
                >
                  {t("Confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
