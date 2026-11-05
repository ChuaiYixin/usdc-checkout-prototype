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
  CreditCard,
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
import { SIMULATED_ONRAMP } from "@/config/app";
import { formatUsdc, shortHex } from "@/lib/money";
import { ownershipMessage } from "@/lib/ownership";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, usdcDomain, type Authorization } from "@/lib/eip3009-types";
import { errorReason, track } from "@/lib/track";
import type { PaymentView } from "@/lib/payments";
import { ExplorerLink, TestnetDisclaimer } from "@/components/ui";
import { ChainDot, UsdcIcon } from "@/components/icons";

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
  const { view, offset } = usePaymentView(initial);
  const now = useNow(offset);
  useEffect(() => track(initial.id, "pay_page_viewed"), [initial.id]);
  const remainingMs = Math.max(0, view.expiresAt - now);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs text-slate-500">Paying</p>
            <p className="font-semibold">{view.merchant}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Order</p>
            <p className="mono font-semibold">{view.orderId}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {view.hasNonUsdc && (
          <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            We received a token that isn&apos;t USDC. <b>Only USDC is accepted.</b> It won&apos;t be credited — our team will
            review it and return it to the sending address.
          </Banner>
        )}
        {view.status === "awaiting_payment" && <AwaitingPayment view={view} remainingMs={remainingMs} />}
        {view.status === "underpaid" && <Underpaid view={view} remainingMs={remainingMs} />}
        {view.status === "confirming" && <Confirming view={view} />}
        {view.status === "succeeded" && <Succeeded view={view} />}
        {view.status === "processing" && (
          <StatusCard icon={<Hourglass className="h-10 w-10 text-blue-600" />} title="Payment received — processing">
            We&apos;ve received your payment and are completing a few final checks. You&apos;ll get an email at the address you
            gave once it&apos;s done — there&apos;s nothing else you need to do.
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "expired" && (
          <StatusCard icon={<Clock className="h-10 w-10 text-slate-400" />} title="This payment request has expired">
            No payment arrived within 15 minutes, so the request was closed to protect you from paying a stale quote.
            <b> Don&apos;t send funds to this address.</b> If you&apos;ve already sent USDC, it will be flagged and the merchant
            will confirm or return it.
            <div className="mt-6">
              <Link href="/store" className="btn-primary">
                <ArrowLeft className="h-4 w-4" /> Back to checkout
              </Link>
            </div>
          </StatusCard>
        )}
        {view.status === "expired_refund" && (
          <StatusCard icon={<RotateCcw className="h-10 w-10 text-amber-500" />} title="Payment expired before the full amount arrived">
            You sent {nominal(view, view.receivedOnchain)} of {formatUsdc(view.amountMicros)} USDC before the request expired.
            The amount you sent will be refunded in full to your sending address.
            <RefundList view={view} />
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "late_merchant_review" && (
          <StatusCard icon={<Hourglass className="h-10 w-10 text-amber-500" />} title="Payment expired — the merchant is confirming">
            Your USDC arrived after the 15-minute window closed. The merchant will either accept the order or refund the full
            amount to your sending address. You&apos;ll be notified by email.
            <TxList view={view} />
          </StatusCard>
        )}
        {view.status === "refunded" && (
          <StatusCard icon={<RotateCcw className="h-10 w-10 text-slate-500" />} title="Refunded">
            This payment was refunded to your original sending address.
            <RefundList view={view} />
          </StatusCard>
        )}

        <OrderSummary view={view} />
        <TestnetDisclaimer className="mt-8" />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function AwaitingPayment({ view, remainingMs }: { view: PaymentView; remainingMs: number }) {
  const [tab, setTab] = useState<"wallet" | "qr" | "card">("wallet");
  const chain = CHAINS[view.chainKey as ChainKey];
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Amount due</p>
            <p className="mt-1 flex items-center gap-2 text-4xl font-bold tracking-tight tabular-nums">
              <UsdcIcon className="h-8 w-8" /> {formatUsdc(view.amountMicros)} <span className="text-xl font-semibold text-slate-400">USDC</span>
            </p>
            {view.divisor > 1 && (
              <p className="mt-1 text-xs text-amber-700">
                Testnet demo: your wallet will send {formatUsdc(view.amountOnchain)} test USDC (1/{view.divisor} scale — Circle&apos;s
                faucet gives 20 USDC every 2 hours).
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
          <p className="text-[10px] uppercase tracking-widest text-white/70 sm:text-[11px]">Send on this network only</p>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight">{chain.name.toUpperCase()}</p>
        </div>
        <p className="basis-full text-[11px] leading-snug text-white/80 sm:ml-auto sm:max-w-[200px] sm:basis-auto sm:text-right">
          USDC sent on any other network can&apos;t be recovered.
        </p>
      </div>

      <div className="p-6">
        <div className="mb-5 flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm sm:inline-flex">
          <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")}>
            <Wallet className="h-4 w-4" /> <span className="sm:hidden">Wallet</span>
            <span className="hidden sm:inline">Connect wallet</span>
            <span className="hidden text-[10px] font-semibold text-emerald-600 lg:inline">Recommended</span>
          </TabButton>
          <TabButton active={tab === "qr"} onClick={() => setTab("qr")}>
            <QrCode className="h-4 w-4" /> <span className="sm:hidden">QR</span>
            <span className="hidden sm:inline">Scan QR code</span>
          </TabButton>
          <TabButton active={tab === "card"} onClick={() => setTab("card")}>
            <CreditCard className="h-4 w-4" /> <span className="sm:hidden">Card</span>
            <span className="hidden sm:inline">No USDC? Use a card</span>
          </TabButton>
        </div>
        {tab === "wallet" && <WalletPay view={view} amountOnchain={view.amountOnchain} />}
        {tab === "qr" && <QrPay view={view} amountOnchain={view.amountOnchain} />}
        {tab === "card" && <CardOnramp view={view} />}
        <p className="mt-6 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          Pay from your own wallet rather than an exchange account — refunds can only be returned to the address that paid.
        </p>
      </div>
    </section>
  );
}

function Underpaid({ view, remainingMs }: { view: PaymentView; remainingMs: number }) {
  const [tab, setTab] = useState<"wallet" | "qr">("wallet");
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-line bg-amber-50 p-6">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Partial payment received
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
            {nominal(view, view.remainingOnchain)} <span className="text-lg text-slate-500">USDC still due</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Received {nominal(view, view.receivedOnchain)} of {formatUsdc(view.amountMicros)} USDC. Top up before the timer ends,
            or what you sent will be refunded in full.
          </p>
        </div>
        <Countdown remainingMs={remainingMs} />
      </div>
      <div className="p-6">
        <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")}>
            <Wallet className="h-4 w-4" /> Wallet
          </TabButton>
          <TabButton active={tab === "qr"} onClick={() => setTab("qr")}>
            <QrCode className="h-4 w-4" /> QR code
          </TabButton>
        </div>
        {tab === "wallet" ? (
          <WalletPay view={view} amountOnchain={view.remainingOnchain} label="Pay remaining" />
        ) : (
          <QrPay view={view} amountOnchain={view.remainingOnchain} />
        )}
        <TxList view={view} />
      </div>
    </section>
  );
}

function Confirming({ view }: { view: PaymentView }) {
  const pct = Math.min(100, Math.round((view.confirmations / view.successThreshold) * 100));
  const left = Math.max(0, view.successThreshold - view.confirmations);
  return (
    <StatusCard icon={<Loader2 className="h-10 w-10 animate-spin text-blue-600" />} title="Payment detected — confirming on-chain">
      <div className="mt-2">
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {view.confirmations} / {view.successThreshold} confirmations
          </span>
          <span>about {Math.max(2, Math.ceil(left * view.blockTimeSec))} s left</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
      </div>
      <p className="mt-4">You can close this page — we&apos;ll email you when it&apos;s confirmed.</p>
      <TxList view={view} />
    </StatusCard>
  );
}

function Succeeded({ view }: { view: PaymentView }) {
  const excess = BigInt(view.excessOnchain);
  return (
    <StatusCard icon={<CheckCircle2 className="h-12 w-12 text-emerald-500" />} title="Payment successful">
      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Order</dt>
        <dd className="mono font-semibold text-ink">{view.orderId}</dd>
        <dt className="text-slate-500">Amount</dt>
        <dd className="text-ink">
          {formatUsdc(view.amountMicros)} USDC
          {view.divisor > 1 && <span className="text-xs text-slate-400"> (on-chain {formatUsdc(view.amountOnchain)} test USDC)</span>}
        </dd>
        <dt className="text-slate-500">Network</dt>
        <dd className="text-ink">{view.chainName}</dd>
      </dl>
      {excess > 0n && (
        <Banner tone="blue" icon={<RotateCcw className="h-4 w-4" />} className="mt-4">
          You paid {nominal(view, view.excessOnchain)} USDC more than the order total. The extra will be returned
          automatically to your sending address.
          <RefundList view={view} />
        </Banner>
      )}
      <TxList view={view} />
      <div className="mt-6">
        <Link href="/store" className="btn-secondary">
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>
      </div>
    </StatusCard>
  );
}

// ---------------------------------------------------------------------------------------------

function WalletPay({ view, amountOnchain, label = "Pay" }: { view: PaymentView; amountOnchain: string; label?: string }) {
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
  const nominalLabel = `${formatUsdc(BigInt(amountOnchain) * BigInt(view.divisor))} USDC`;

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
    setError(m.includes("User rejected") || m.includes("denied") ? "Request rejected in wallet." : m);
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
      <div>
        <button
          className="btn-primary w-full py-3 text-base"
          disabled={connect.isPending}
          onClick={() => {
            setError(null);
            connect.mutateAsync({ connector: connectors[0] }).catch(fail);
          }}
        >
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Connect browser wallet
        </button>
        {!hasInjected && (
          <p className="mt-3 text-sm text-slate-500">
            No browser wallet detected. Install MetaMask (or another extension wallet), or use the QR code tab with a mobile wallet.
          </p>
        )}
        {connectors.find((c) => c.id === "devTestWallet") && (
          <button
            className="btn-secondary mt-3 w-full border-dashed border-amber-400 text-amber-800"
            disabled={connect.isPending}
            onClick={() => {
              setError(null);
              connect.mutateAsync({ connector: connectors.find((c) => c.id === "devTestWallet")! }).catch(fail);
            }}
          >
            Use test wallet (dev only — signs with TEST_BUYER_PRIVATE_KEY)
          </button>
        )}
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected <span className="mono">{shortHex(address!)}</span>
        </span>
        <span className="flex items-center gap-3">
          {wrongChain ? (
            <span className="text-xs font-medium text-amber-700">Switching to {view.chainName}…</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ChainDot chainKey={view.chainKey} className="h-3.5 w-3.5" /> {view.chainName}
            </span>
          )}
          <button className="text-xs text-slate-500 hover:text-ink" onClick={() => disconnect.mutate()}>
            Disconnect
          </button>
        </span>
      </div>

      {needsVerification ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-medium">Step 1 · Prove you control this wallet</p>
          <p className="mt-1 text-xs text-slate-500">
            Required for orders above the travel-rule threshold. Signing is free and doesn&apos;t move funds.
          </p>
          <button className="btn-secondary mt-3" onClick={verify} disabled={sign.isPending}>
            {sign.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Sign verification message
          </button>
        </div>
      ) : submitted ? (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" /> Transaction sent — waiting for the network…
          </p>
          <p className="mt-1">
            <ExplorerLink href={txUrl(CHAINS[view.chainKey as ChainKey], submitted)}>{shortHex(submitted, 10, 8)}</ExplorerLink>
          </p>
        </div>
      ) : (
        <>
          <button className="btn-primary w-full flex-col gap-0.5 py-3 text-base" onClick={payGasless} disabled={gaslessBusy || switchChain.isPending}>
            <span className="flex items-center gap-2">
              {gaslessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {gaslessBusy ? "Sign in your wallet…" : `${label} ${nominalLabel} — no gas needed`}
            </span>
            {!gaslessBusy && (
              <span className="text-xs font-normal text-white/80">
                Sign once; we cover the network fee{view.divisor > 1 ? ` · ${formatUsdc(amountOnchain)} test USDC` : ""}
              </span>
            )}
          </button>
          <button
            className="btn-secondary w-full"
            onClick={pay}
            disabled={write.isPending || switchChain.isPending || noGas}
            title={noGas ? `No ${view.chainName} ETH in this wallet — use the gasless option` : undefined}
          >
            {write.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsdcIcon className="h-4 w-4" mono />}
            {write.isPending ? "Confirm in your wallet…" : `Or send a normal transfer (you pay gas)`}
          </button>
          {noGas && <p className="text-xs text-slate-500">This wallet has no {view.chainName} ETH, so a normal transfer would fail — the gasless option works without it.</p>}
        </>
      )}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">Amount and address are filled in for you.</p>
    </div>
  );
}


/** SIMULATED card → USDC on-ramp: for buyers who want to pay this way but don't hold USDC yet. */
function CardOnramp({ view }: { view: PaymentView }) {
  const [step, setStep] = useState<"quote" | "partner" | "done">("quote");
  const [error, setError] = useState<string | null>(null);
  const usd = Number(view.amountMicros) / 1e6;
  const fee = Math.round((usd * SIMULATED_ONRAMP.feeBps) / 100) / 100; // bps → dollars, rounded to cents
  async function complete() {
    setError(null);
    const res = await fetch(`/api/payments/${view.id}/onramp`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setStep("done");
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900">
        <span className="sim-tag mr-1">Simulated</span>
        A licensed on-ramp partner charges your card, buys the USDC and sends it straight to this order — the merchant still gets a final USDC
        payment. No card details are collected in this prototype.
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
        <dt className="text-slate-500">Order amount</dt>
        <dd className="text-right tabular-nums">{formatUsdc(view.amountMicros)} USDC</dd>
        <dt className="text-slate-500">On-ramp fee ({(SIMULATED_ONRAMP.feeBps / 100).toFixed(1)}%, illustrative)</dt>
        <dd className="text-right tabular-nums">${fee.toFixed(2)}</dd>
        <dt className="border-t border-line pt-1.5 font-semibold">Charged to your card</dt>
        <dd className="border-t border-line pt-1.5 text-right font-semibold tabular-nums">${(usd + fee).toFixed(2)}</dd>
      </dl>
      {step === "quote" && (
        <button className="btn-primary w-full py-3" onClick={() => setStep("partner")}>
          <CreditCard className="h-4 w-4" /> Continue with {SIMULATED_ONRAMP.partnerLabel}
        </button>
      )}
      {step === "partner" && (
        <div className="rounded-xl border border-line p-4 text-sm">
          <p className="font-semibold">{SIMULATED_ONRAMP.partnerLabel}</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li>✓ Identity check (KYC) — done by the partner (simulated)</li>
            <li>✓ Card authorised for ${(usd + fee).toFixed(2)} (simulated)</li>
            <li>→ {formatUsdc(view.amountMicros)} USDC will be sent to this order on {view.chainName}</li>
          </ul>
          <button className="btn-primary mt-4 w-full" onClick={complete}>
            Confirm purchase (simulated)
          </button>
        </div>
      )}
      {step === "done" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">USDC is on its way — this page will update in a moment.</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">
        Trade-off: the buyer pays an on-ramp fee and the partner takes on card chargeback risk; the merchant keeps the stablecoin
        benefits (fast, final settlement).
      </p>
    </div>
  );
}

function QrPay({ view, amountOnchain }: { view: PaymentView; amountOnchain: string }) {
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
      <div className="rounded-2xl border border-line bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="Payment QR code" className="h-full w-full" /> : <div className="aspect-square animate-pulse rounded-xl bg-slate-100" />}
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Scan with a wallet that supports payment links (EIP-681). The token, amount, network and address are filled in
          automatically — check the network shows <b>{view.chainName}</b> before you confirm.
        </p>
        <CopyRow label="Amount" value={`${formatUsdc(amountOnchain)} ${view.divisor > 1 ? "test " : ""}USDC`} copied={copied === "amt"} onCopy={() => copy("amt", formatUsdc(amountOnchain))} />
        <CopyRow label="Deposit address" value={view.address} mono copied={copied === "addr"} onCopy={() => copy("addr", view.address)} />
        <p className="text-xs text-slate-400">This address is unique to this order and only accepts USDC on {view.chainName}.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function ChainPicker({ selected }: { selected: ChainKey }) {
  const chains = Object.values(CHAINS);
  return (
    <div className="px-6 pt-5">
      <p className="mb-2 text-xs font-medium text-slate-600">Network</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {chains.map((c) => {
          const live = c.availability === "live";
          const active = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!live}
              title={c.note}
              className={`rounded-xl border p-3 text-left transition ${
                active ? "border-brand bg-blue-50/60 ring-4 ring-blue-50" : "border-line"
              } ${live ? "" : "cursor-not-allowed opacity-50"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ChainDot chainKey={c.key} className="h-4 w-4" /> {c.name}
              </span>
              <span className="mt-1 block text-[11px] text-slate-500">
                {live ? `${c.estFeeLabel} · ${c.estTimeLabel}` : "Not available in prototype"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Countdown({ remainingMs }: { remainingMs: number }) {
  const m = Math.floor(remainingMs / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  const low = remainingMs < 3 * 60 * 1000;
  return (
    <div className={`shrink-0 rounded-xl px-3 py-2 text-right ${low ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">Expires in</p>
      <p className="mono text-xl font-bold tabular-nums">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </p>
    </div>
  );
}

function TxList({ view }: { view: PaymentView }) {
  const chain = CHAINS[view.chainKey as ChainKey];
  if (!view.txHashes.length) return null;
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
      <p className="mb-2 text-xs font-medium text-slate-500">Transaction{view.txHashes.length > 1 ? "s" : ""}</p>
      <ul className="space-y-1">
        {view.txHashes.map((t) => (
          <li key={t.hash} className="flex items-center justify-between gap-2">
            {t.simulated ? (
              <span className="mono text-slate-600">
                {shortHex(t.hash, 10, 8)} <span className="sim-tag ml-1">Simulated</span>
              </span>
            ) : (
              <ExplorerLink href={txUrl(chain, t.hash)}>{shortHex(t.hash, 10, 8)}</ExplorerLink>
            )}
            <span className="text-xs text-slate-400">{t.confirmations} conf.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefundList({ view }: { view: PaymentView }) {
  if (!view.refunds.length) return null;
  const chain = CHAINS[view.chainKey as ChainKey];
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {view.refunds.map((r, i) => (
        <li key={i} className="flex items-center gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          Refund {nominal(view, r.amountOnchain)} USDC —{" "}
          {r.status === "succeeded" ? (
            r.txHash && !r.txHash.startsWith("sim") ? (
              <ExplorerLink href={txUrl(chain, r.txHash)}>sent</ExplorerLink>
            ) : (
              "sent"
            )
          ) : (
            "in progress"
          )}
        </li>
      ))}
    </ul>
  );
}

function OrderSummary({ view }: { view: PaymentView }) {
  return (
    <details className="card mt-6 p-5 text-sm">
      <summary className="cursor-pointer font-medium">Order summary</summary>
      <ul className="mt-3 space-y-1 text-slate-600">
        {view.order.items.map((it) => (
          <li key={it.name} className="flex justify-between">
            <span>
              {it.quantity} × {it.name}
            </span>
            <span>${((it.unitCents * it.quantity) / 100).toFixed(2)}</span>
          </li>
        ))}
        <li className="flex justify-between">
          <span>Shipping</span>
          <span>${(view.order.shippingCents / 100).toFixed(2)}</span>
        </li>
        <li className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
          <span>Total</span>
          <span>${(view.order.totalCents / 100).toFixed(2)} = {formatUsdc(view.amountMicros)} USDC</span>
        </li>
      </ul>
    </details>
  );
}

function StatusCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-8">
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
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-white shadow-sm" : "text-slate-500 hover:text-ink"}`}
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
        <button type="button" onClick={onCopy} className="text-slate-400 hover:text-ink" aria-label={`Copy ${label}`}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
