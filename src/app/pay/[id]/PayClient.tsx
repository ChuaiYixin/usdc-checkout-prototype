"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Hourglass,
  Loader2,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { useBalance, useConnect, useConnection, useConnectors, useDisconnect, useSignMessage, useSignTypedData, useSwitchChain, useWriteContract } from "wagmi";
import { erc20Abi } from "viem";
import { CHAINS, txUrl, type ChainKey } from "@/config/chains";
import { formatUsdc, shortHex } from "@/lib/money";
import { ownershipMessage } from "@/lib/ownership";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, usdcDomain, type Authorization } from "@/lib/eip3009-types";
import { errorReason, track } from "@/lib/track";
import type { PaymentView } from "@/lib/payments";
import { ExplorerLink } from "@/components/ui";
import { ChainDot, UsdcIcon } from "@/components/icons";
import { useT } from "@/i18n/client";

const TERMINAL = new Set(["succeeded", "refunded", "expired", "expired_refund"]);

function usePaymentView(initial: PaymentView) {
  const [view, setView] = useState(initial);
  const [offset] = useState(() => initial.serverTime - Date.now());
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/${initial.id}`, { cache: "no-store" });
        if (res.ok && !stop) setView(await res.json());
      } catch {}
    };
    const t = setInterval(tick, TERMINAL.has(view.status) ? 5000 : 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [initial.id, view.status]);
  return { view, offset };
}

function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

/** on-chain base units -> nominal USDC string */
function nominal(v: PaymentView, onchain: string) {
  return formatUsdc(BigInt(onchain) * BigInt(v.divisor));
}

export function PayClient({ initial }: { initial: PaymentView }) {
  const t = useT();
  const { view, offset } = usePaymentView(initial);
  const now = useNow(offset);
  useEffect(() => track(initial.id, "pay_page_viewed"), [initial.id]);
  const remainingMs = Math.max(0, view.expiresAt - now);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs text-slate-500">{t("Paying")}</p>
            <p className="font-semibold">{view.merchant}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{t("Order")}</p>
            <p className="mono font-semibold">{view.orderId}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {view.hasNonUsdc && (
          <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            {t("We received a token that isn't USDC.")} <b>{t("Only USDC is accepted.")}</b>{" "}
            {t("It won't be credited — our team will review it and return it to the sending address.")}
          </Banner>
        )}
        {view.status === "awaiting_payment" && <AwaitingPayment view={view} remainingMs={remainingMs} />}
        {view.status === "underpaid" && <Underpaid view={view} remainingMs={remainingMs} />}
        {view.status === "confirming" && <Confirming view={view} />}
        {view.status === "succeeded" && <Succeeded view={view} />}
        {view.status === "processing" && (
          <StatusCard icon={<Hourglass className="h-10 w-10 text-brand" />} title={t("Payment received — processing")}>
            {t("We've received your payment and are completing a few final checks. You'll get an email at the address you gave once it's done — there's nothing else you need to do.")}
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "expired" && (
          <StatusCard icon={<Clock className="h-10 w-10 text-slate-400" />} title={t("This payment request has expired")}>
            {t("No payment arrived within 15 minutes, so the request was closed to protect you from paying a stale quote.")}{" "}
            <b>{t("Don't send funds to this address.")}</b>{" "}
            {t("If you've already sent USDC, it will be flagged and the merchant will confirm or return it.")}
            <div className="mt-6">
              <Link href="/store" className="btn-primary">
                <ArrowLeft className="h-4 w-4" /> {t("Back to checkout")}
              </Link>
            </div>
          </StatusCard>
        )}
        {view.status === "expired_refund" && (
          <StatusCard icon={<RotateCcw className="h-10 w-10 text-amber-500" />} title={t("Payment expired before the full amount arrived")}>
            {t("You sent {received} of {total} USDC before the request expired. The amount you sent will be refunded in full to your sending address.", {
              received: nominal(view, view.receivedOnchain),
              total: formatUsdc(view.amountMicros),
            })}
            <RefundList view={view} />
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "late_merchant_review" && (
          <StatusCard icon={<Hourglass className="h-10 w-10 text-amber-500" />} title={t("Payment expired — the merchant is confirming")}>
            {t("Your USDC arrived after the 15-minute window closed. The merchant will either accept the order or refund the full amount to your sending address. You'll be notified by email.")}
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "refunded" && (
          <StatusCard icon={<RotateCcw className="h-10 w-10 text-slate-500" />} title={t("Refunded")}>
            {t("This payment was refunded to your original sending address.")}
            <RefundList view={view} />
          </StatusCard>
        )}

        <OrderSummary view={view} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function AwaitingPayment({ view, remainingMs }: { view: PaymentView; remainingMs: number }) {
  const t = useT();
  const [tab, setTab] = useState<"wallet" | "qr">("wallet");
  const chain = CHAINS[view.chainKey as ChainKey];
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">{t("Amount due")}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
              <UsdcIcon className="h-8 w-8" /> {formatUsdc(view.amountMicros)} <span className="text-xl font-semibold text-slate-400">USDC</span>
            </p>
            {view.divisor > 1 && (
              <p className="mt-1 text-xs text-slate-500">
                {t("Network amount: {n} USDC.", { n: formatUsdc(view.amountOnchain) })}
              </p>
            )}
          </div>
          <Countdown remainingMs={remainingMs} />
        </div>
      </div>

      <ChainPicker selected={view.chainKey as ChainKey} />

      {/* Wrong-chain prevention: big network name right above the action */}
      <div className="mx-6 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#0052ff] px-4 py-3 text-white">
        <ChainDot chainKey={view.chainKey} className="h-7 w-7 shrink-0 rounded-full ring-2 ring-white/60" />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/70 sm:text-[11px]">{t("Send on this network only")}</p>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight">{chain.name.toUpperCase()}</p>
        </div>
        <p className="basis-full text-[11px] leading-snug text-white/80 sm:ml-auto sm:max-w-[200px] sm:basis-auto sm:text-right">
          {t("USDC sent on any other network can't be recovered.")}
        </p>
      </div>

      <div className="p-6">
        <div className="mb-5 inline-flex max-w-full rounded-xl bg-slate-100 p-1 text-sm">
          <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")}>
            <Wallet className="h-4 w-4" /> {t("Connect wallet")}
            <span className="hidden text-[10px] font-semibold text-emerald-600 sm:inline">{t("Recommended")}</span>
          </TabButton>
          <TabButton active={tab === "qr"} onClick={() => setTab("qr")}>
            <QrCode className="h-4 w-4" /> {t("Scan QR code")}
          </TabButton>
        </div>
        {tab === "wallet" ? <WalletPay view={view} amountOnchain={view.amountOnchain} /> : <QrPay view={view} amountOnchain={view.amountOnchain} />}
        <p className="mt-6 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {t("Pay from your own wallet rather than an exchange account — refunds can only be returned to the address that paid.")}
        </p>
      </div>
    </section>
  );
}

function Underpaid({ view, remainingMs }: { view: PaymentView; remainingMs: number }) {
  const t = useT();
  const [tab, setTab] = useState<"wallet" | "qr">("wallet");
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-line bg-amber-50 p-6">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> {t("Partial payment received")}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
            {nominal(view, view.remainingOnchain)} <span className="text-lg text-slate-500">{t("USDC still due")}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("Received {received} of {total} USDC. Top up before the timer ends, or what you sent will be refunded in full.", {
              received: nominal(view, view.receivedOnchain),
              total: formatUsdc(view.amountMicros),
            })}
          </p>
        </div>
        <Countdown remainingMs={remainingMs} />
      </div>
      <div className="p-6">
        <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")}>
            <Wallet className="h-4 w-4" /> {t("Wallet")}
          </TabButton>
          <TabButton active={tab === "qr"} onClick={() => setTab("qr")}>
            <QrCode className="h-4 w-4" /> {t("QR code")}
          </TabButton>
        </div>
        {tab === "wallet" ? <WalletPay view={view} amountOnchain={view.remainingOnchain} remainder /> : <QrPay view={view} amountOnchain={view.remainingOnchain} />}
        <TxList view={view} />
      </div>
    </section>
  );
}

function Confirming({ view }: { view: PaymentView }) {
  const t = useT();
  const pct = Math.min(100, Math.round((view.confirmations / view.successThreshold) * 100));
  const left = Math.max(0, view.successThreshold - view.confirmations);
  return (
    <StatusCard guide="pay-status" icon={<Loader2 className="h-10 w-10 animate-spin text-brand" />} title={t("Payment detected — confirming on-chain")}>
      <div className="mt-2">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{t("{n} / {total} confirmations", { n: view.confirmations, total: view.successThreshold })}</span>
          <span>{t("about {n} s left", { n: Math.max(2, Math.ceil(left * view.blockTimeSec)) })}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full animate-sheen rounded-full bg-[linear-gradient(90deg,#c6ff4a,#efffc2,#c6ff4a)] bg-[length:200%_100%] transition-all duration-700" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
      </div>
      <p className="mt-4">{t("You can close this page — we'll email you when it's confirmed.")}</p>
      <TxList view={view} />
    </StatusCard>
  );
}

function Succeeded({ view }: { view: PaymentView }) {
  const t = useT();
  const excess = BigInt(view.excessOnchain);
  return (
    <StatusCard
      guide="pay-success"
      icon={
        <svg viewBox="0 0 48 48" className="h-14 w-14 animate-pop text-brand" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="24" cy="24" r="21" opacity="0.25" />
          <path className="check-draw" pathLength={1} d="M14 25l7 7 13-15" />
        </svg>
      }
      title={t("Payment successful")}
    >
      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">{t("Order")}</dt>
        <dd className="mono font-semibold text-ink">{view.orderId}</dd>
        <dt className="text-slate-500">{t("Amount")}</dt>
        <dd className="text-ink">
          {formatUsdc(view.amountMicros)} USDC
          {view.divisor > 1 && <span className="text-xs text-slate-400"> {t("(on-chain {n} USDC)", { n: formatUsdc(view.amountOnchain) })}</span>}
        </dd>
        <dt className="text-slate-500">{t("Network")}</dt>
        <dd className="text-ink">{view.chainName}</dd>
      </dl>
      {excess > 0n && (
        <Banner tone="blue" icon={<RotateCcw className="h-4 w-4" />} className="mt-4">
          {t("You paid {n} USDC more than the order total. The extra will be returned automatically to your sending address.", { n: nominal(view, view.excessOnchain) })}
          <RefundList view={view} />
        </Banner>
      )}
      <TxList view={view} />
      <div className="mt-6">
        <Link href="/store" className="btn-secondary">
          <ArrowLeft className="h-4 w-4" /> {t("Back to store")}
        </Link>
      </div>
    </StatusCard>
  );
}

// ---------------------------------------------------------------------------------------------

function WalletPay({ view, amountOnchain, remainder = false }: { view: PaymentView; amountOnchain: string; remainder?: boolean }) {
  const t = useT();
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const write = useWriteContract();
  const sign = useSignMessage();
  const signTyped = useSignTypedData();
  const eth = useBalance({ address, chainId: view.chainId as 84532, query: { enabled: !!address } });
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(view.walletVerified);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [gaslessBusy, setGaslessBusy] = useState(false);
  const [hasInjected, setHasInjected] = useState(true);
  useEffect(() => setHasInjected(!!(window as unknown as { ethereum?: unknown }).ethereum), []);
  const wrongChain = isConnected && chainId !== view.chainId;
  const needsVerification = view.travelRuleTier === "enhanced" && !verified;
  const noGas = eth.data !== undefined && eth.data.value === 0n;
  const nominalAmount = formatUsdc(BigInt(amountOnchain) * BigInt(view.divisor));

  // PRD: "连接钱包时自动切链"
  useEffect(() => {
    if (wrongChain && view.chainId && !switchChain.isPending) {
      switchChain.mutateAsync({ chainId: view.chainId as 84532 }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongChain]);

  useEffect(() => {
    if (isConnected) track(view.id, "wallet_connected");
  }, [isConnected, view.id]);

  const fail = (e: unknown) => {
    const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
    track(view.id, "error", { reason: errorReason(m) });
    setError(t(m.includes("User rejected") || m.includes("denied") ? "Request rejected in wallet." : m));
  };

  async function verify() {
    setError(null);
    try {
      const signature = await sign.mutateAsync({ message: ownershipMessage(view.id, address!) });
      const res = await fetch(`/api/payments/${view.id}/verify-wallet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setVerified(true);
    } catch (e) {
      fail(e);
    }
  }

  async function pay() {
    setError(null);
    try {
      if (wrongChain) await switchChain.mutateAsync({ chainId: view.chainId as 84532 });
      const hash = await write.mutateAsync({
        address: view.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [view.address as `0x${string}`, BigInt(amountOnchain)],
        chainId: view.chainId as 84532,
      });
      track(view.id, "tx_submitted", { mode: "wallet" });
      setSubmitted(hash);
    } catch (e) {
      fail(e);
    }
  }

  // Gasless: sign an EIP-3009 authorisation for exactly the amount due; the platform submits it and pays gas.
  async function payGasless() {
    setError(null);
    setGaslessBusy(true);
    try {
      if (wrongChain) await switchChain.mutateAsync({ chainId: view.chainId as 84532 });
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const authorization: Authorization = {
        from: address!,
        to: view.address as `0x${string}`,
        value: amountOnchain,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 1800),
        nonce: `0x${[...nonceBytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
      };
      const signature = await signTyped.mutateAsync({
        domain: usdcDomain(),
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: { ...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore) },
      });
      const res = await fetch(`/api/payments/${view.id}/gasless`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorization, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmitted(data.hash);
    } catch (e) {
      fail(e);
    } finally {
      setGaslessBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <div data-guide="pay-connect">
        <button
          className="btn-primary w-full py-3 text-base"
          disabled={connect.isPending}
          onClick={() => {
            setError(null);
            connect.mutateAsync({ connector: connectors[0] }).catch(fail);
          }}
        >
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {t("Connect browser wallet")}
        </button>
        {!hasInjected && (
          <p className="mt-3 text-sm text-slate-500">
            {t("No browser wallet detected. Install MetaMask (or another extension wallet), or use the QR code tab with a mobile wallet.")}
          </p>
        )}
        {connectors.find((c) => c.id === "devTestWallet") && (
          <button
            className="btn-secondary mt-3 w-full"
            disabled={connect.isPending}
            onClick={() => {
              setError(null);
              connect.mutateAsync({ connector: connectors.find((c) => c.id === "devTestWallet")! }).catch(fail);
            }}
          >
            {t("Use built-in wallet")}
          </button>
        )}
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("Connected")} <span className="mono">{shortHex(address!)}</span>
        </span>
        <span className="flex items-center gap-3">
          {wrongChain ? (
            <span className="text-xs font-medium text-amber-700">{t("Switching to {chain}…", { chain: view.chainName })}</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ChainDot chainKey={view.chainKey} className="h-3.5 w-3.5" /> {view.chainName}
            </span>
          )}
          <button className="text-xs text-slate-500 hover:text-ink" onClick={() => disconnect.mutate()}>
            {t("Disconnect")}
          </button>
        </span>
      </div>

      {needsVerification ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-medium">{t("Step 1 · Prove you control this wallet")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("Required for orders above the travel-rule threshold. Signing is free and doesn't move funds.")}</p>
          <button className="btn-secondary mt-3" onClick={verify} disabled={sign.isPending}>
            {sign.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("Sign verification message")}
          </button>
        </div>
      ) : submitted ? (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Transaction sent — waiting for the network…")}
          </p>
          <p className="mt-1">
            <ExplorerLink href={txUrl(CHAINS[view.chainKey as ChainKey], submitted)}>{shortHex(submitted, 10, 8)}</ExplorerLink>
          </p>
        </div>
      ) : (
        <>
          <button data-guide="pay-gasless" className="btn-primary w-full flex-col gap-0.5 py-3 text-base" onClick={payGasless} disabled={gaslessBusy || switchChain.isPending}>
            <span className="flex items-center gap-2">
              {gaslessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {gaslessBusy
                ? t("Sign in your wallet…")
                : t(remainder ? "Pay remaining {n} USDC — no gas needed" : "Pay {n} USDC — no gas needed", { n: nominalAmount })}
            </span>
            {!gaslessBusy && (
              <span className="text-xs font-normal opacity-75">
                {t("Sign once; we cover the network fee")}
                {view.divisor > 1 ? ` · ${t("{n} USDC on-chain", { n: formatUsdc(amountOnchain) })}` : ""}
              </span>
            )}
          </button>
          <button
            className="btn-secondary w-full"
            onClick={pay}
            disabled={write.isPending || switchChain.isPending || noGas}
            title={noGas ? t("No {chain} ETH in this wallet — use the gasless option", { chain: view.chainName }) : undefined}
          >
            {write.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsdcIcon className="h-4 w-4" mono />}
            {write.isPending ? t("Confirm in your wallet…") : t("Or send a normal transfer (you pay gas)")}
          </button>
          {noGas && <p className="text-xs text-slate-500">{t("This wallet has no {chain} ETH, so a normal transfer would fail — the gasless option works without it.", { chain: view.chainName })}</p>}
        </>
      )}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">{t("Amount and address are filled in for you.")}</p>
    </div>
  );
}

function QrPay({ view, amountOnchain }: { view: PaymentView; amountOnchain: string }) {
  const t = useT();
  // EIP-681 payment URI: wallet opens a pre-filled USDC transfer on the right chain.
  const uri = `ethereum:${view.tokenAddress}@${view.chainId}/transfer?address=${view.address}&uint256=${amountOnchain}`;
  const [src, setSrc] = useState<string>();
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(uri, { margin: 1, width: 440, color: { dark: "#0f172a" } }).then(setSrc);
  }, [uri]);
  useEffect(() => track(view.id, "qr_shown"), [view.id]);
  const copy = (k: string, v: string) => {
    navigator.clipboard.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="rounded-2xl border border-line bg-[#fff] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={t("Payment QR code")} className="h-full w-full" /> : <div className="aspect-square animate-pulse rounded-xl bg-slate-100" />}
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          {t("Scan with a wallet that supports payment links (EIP-681). The token, amount, network and address are filled in automatically — check the network shows {chain} before you confirm.", {
            chain: view.chainName,
          })}
        </p>
        <CopyRow label={t("Amount")} value={`${formatUsdc(amountOnchain)} USDC`} copied={copied === "amt"} onCopy={() => copy("amt", formatUsdc(amountOnchain))} />
        <CopyRow label={t("Deposit address")} value={view.address} mono copied={copied === "addr"} onCopy={() => copy("addr", view.address)} />
        <p className="text-xs text-slate-400">{t("This address is unique to this order and only accepts USDC on {chain}.", { chain: view.chainName })}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function ChainPicker({ selected }: { selected: ChainKey }) {
  const t = useT();
  const chains = Object.values(CHAINS);
  return (
    <div className="px-6 pt-5">
      <p className="mb-2 text-xs font-medium text-slate-600">{t("Network")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {chains.map((c) => {
          const live = c.availability === "live";
          const active = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!live}
              title={c.note ? t(c.note) : undefined}
              className={`rounded-xl border p-3 text-left transition ${active ? "border-brand bg-brand/10 ring-4 ring-brand/15" : "border-line"} ${live ? "" : "cursor-not-allowed opacity-50"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ChainDot chainKey={c.key} className="h-4 w-4" /> {c.name}
              </span>
              <span className="mt-1 block text-[11px] text-slate-500">{live ? `${t(c.estFeeLabel)} · ${t(c.estTimeLabel)}` : t("Coming soon")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Countdown({ remainingMs }: { remainingMs: number }) {
  const t = useT();
  const m = Math.floor(remainingMs / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  const low = remainingMs < 3 * 60 * 1000;
  return (
    <div className={`shrink-0 rounded-xl px-3 py-2 text-right ${low ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{t("Expires in")}</p>
      <p className="mono text-xl font-bold tabular-nums">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </p>
    </div>
  );
}

function TxList({ view }: { view: PaymentView }) {
  const t = useT();
  const chain = CHAINS[view.chainKey as ChainKey];
  if (!view.txHashes.length) return null;
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
      <p className="mb-2 text-xs font-medium text-slate-500">{t(view.txHashes.length > 1 ? "Transactions" : "Transaction")}</p>
      <ul className="space-y-1">
        {view.txHashes.map((tx) => (
          <li key={tx.hash} className="flex items-center justify-between gap-2">
            {tx.simulated ? (
              <span className="mono text-slate-600">
                {shortHex(tx.hash, 10, 8)}
              </span>
            ) : (
              <ExplorerLink href={txUrl(chain, tx.hash)}>{shortHex(tx.hash, 10, 8)}</ExplorerLink>
            )}
            <span className="text-xs text-slate-400">{t("{n} conf.", { n: tx.confirmations })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefundList({ view }: { view: PaymentView }) {
  const t = useT();
  if (!view.refunds.length) return null;
  const chain = CHAINS[view.chainKey as ChainKey];
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {view.refunds.map((r, i) => (
        <li key={i} className="flex items-center gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          {t("Refund {n} USDC —", { n: nominal(view, r.amountOnchain) })}{" "}
          {r.status === "succeeded" ? (
            r.txHash && !r.txHash.startsWith("sim") ? (
              <ExplorerLink href={txUrl(chain, r.txHash)}>{t("sent")}</ExplorerLink>
            ) : (
              t("sent")
            )
          ) : (
            t("in progress")
          )}
        </li>
      ))}
    </ul>
  );
}

function OrderSummary({ view }: { view: PaymentView }) {
  const t = useT();
  return (
    <details className="card mt-6 p-5 text-sm">
      <summary className="cursor-pointer font-medium">{t("Order summary")}</summary>
      <ul className="mt-3 space-y-1 text-slate-600">
        {view.order.items.map((it) => (
          <li key={it.name} className="flex justify-between">
            <span>
              {it.quantity} × {t(it.name)}
            </span>
            <span>${((it.unitCents * it.quantity) / 100).toFixed(2)}</span>
          </li>
        ))}
        <li className="flex justify-between">
          <span>{t("Shipping")}</span>
          <span>${(view.order.shippingCents / 100).toFixed(2)}</span>
        </li>
        <li className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
          <span>{t("Total")}</span>
          <span>${(view.order.totalCents / 100).toFixed(2)} = {formatUsdc(view.amountMicros)} USDC</span>
        </li>
      </ul>
    </details>
  );
}

function StatusCard({ icon, title, children, guide }: { icon: React.ReactNode; title: string; children: React.ReactNode; guide?: string }) {
  return (
    <section data-guide={guide} className="card animate-rise p-8">
      {icon}
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
      <div className="mt-2 text-slate-600">{children}</div>
    </section>
  );
}

function Banner({ tone, icon, children, className = "mb-4" }: { tone: "amber" | "blue"; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  const cls = tone === "amber" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-blue-50 text-blue-900 ring-blue-200";
  return (
    <div className={`flex gap-2 rounded-xl p-4 text-sm ring-1 ring-inset ${cls} ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-surface shadow-sm" : "text-slate-500 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function CopyRow({ label, value, mono, copied, onCopy }: { label: string; value: string; mono?: boolean; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 py-2">
        <span className={`flex-1 break-all ${mono ? "mono" : "font-semibold"}`}>{value}</span>
        <button type="button" onClick={onCopy} className="text-slate-400 hover:text-ink" aria-label={label}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
