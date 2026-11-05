"use client";

// DEV-ONLY EIP-1193 provider backed by /api/dev/test-wallet. Wired into wagmi's `injected` connector as a
// custom target, so the payment page code path is exactly the one MetaMask would take.
const CHAIN_HEX = "0x14a34"; // 84532 Base Sepolia

type Listener = (...args: unknown[]) => void;

export function createTestWalletProvider() {
  let address: string | null = null;
  const listeners = new Map<string, Set<Listener>>();
  const call = async (method: string, params?: unknown[]) => {
    const res = await fetch("/api/dev/test-wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params }) });
    const data = await res.json();
    if (data.error) throw Object.assign(new Error(data.error.message ?? data.error), { code: data.error.code ?? -32000 });
    return data.result;
  };
  return {
    isTestWallet: true,
    async request({ method, params }: { method: string; params?: unknown[] }) {
      switch (method) {
        case "eth_requestAccounts": {
          if (!address) address = (await (await fetch("/api/dev/test-wallet")).json()).address;
          return address ? [address] : [];
        }
        case "eth_accounts":
          // like a real wallet: no account is exposed until the user explicitly connects
          return address ? [address] : [];
        case "eth_chainId":
          return CHAIN_HEX;
        case "net_version":
          return "84532";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "wallet_requestPermissions":
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_revokePermissions":
          address = null;
          return null;
        default:
          return call(method, params);
      }
    },
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    removeListener(event: string, fn: Listener) {
      listeners.get(event)?.delete(fn);
    },
  };
}
