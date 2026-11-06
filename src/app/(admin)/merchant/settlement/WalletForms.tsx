"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/i18n/client";

async function post(body: unknown) {
  const res = await fetch("/api/merchant/settlement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
}

export function WhitelistForm({ demoCode }: { demoCode: string }) {
  const router = useRouter();
  const t = useT();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {step === 1 ? (
        <>
          <input className="input mono" placeholder={t("0x… wallet address")} value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className="input" placeholder={t("Label (e.g. Company Safe)")} value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-secondary btn-sm" disabled={!address} onClick={() => setStep(2)}>
            {t("Continue — verify")}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            {t("New whitelist addresses need a second verification. We sent a code to the account owner's authenticator.")}
            <span className="ml-1 font-semibold text-brand">{t("Your code: {code}", { code: demoCode })}</span>
          </p>
          <input className="input mono" placeholder={t("6-digit code")} value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="flex gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await post({ action: "whitelist", address, label, code });
                  setStep(1);
                  setAddress("");
                  setLabel("");
                  setCode("");
                  router.refresh();
                } catch (e) {
                  setErr(t((e as Error).message));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("Verify & add")}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setStep(1)}>
              {t("Back")}
            </button>
          </div>
        </>
      )}
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}

export function WithdrawForm({ wallets }: { wallets: { address: string; label: string }[] }) {
  const router = useRouter();
  const t = useT();
  const [address, setAddress] = useState(wallets[0]?.address ?? "");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!wallets.length) return <p className="text-xs text-slate-500">{t("Add a whitelisted wallet first.")}</p>;
  return (
    <div className="space-y-2">
      <select className="input" value={address} onChange={(e) => setAddress(e.target.value)}>
        {wallets.map((w) => (
          <option key={w.address} value={w.address}>
            {w.label} — {w.address.slice(0, 10)}…
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input className="input" placeholder={t("Amount in USDC")} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          className="btn-primary btn-sm shrink-0"
          onClick={async () => {
            setErr(null);
            try {
              await post({ action: "withdraw", address, amount });
              setAmount("");
              router.refresh();
            } catch (e) {
              setErr(t((e as Error).message));
            }
          }}
        >
          {t("Withdraw")}
        </button>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}
