"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function ClaimForm({ id, demoOtp }: { id: string; demoOtp: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/refund-claims/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ otp, address }) });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) return setError(data.error);
        router.refresh();
      }}
    >
      <div>
        <label className="label">
          Code from your email <span className="sim-tag ml-1">Demo code: {demoOtp}</span>
        </label>
        <input className="input mono" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6 digits" required />
      </div>
      <div>
        <label className="label">Your refund address (Base)</label>
        <input className="input mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" required />
        <p className="mt-1 text-[11px] text-slate-500">Not an exchange deposit address. It will be screened before the refund is sent.</p>
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send my refund
      </button>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </form>
  );
}
