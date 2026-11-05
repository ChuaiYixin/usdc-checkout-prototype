"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { baseSepolia } from "wagmi/chains";
import { createTestWalletProvider } from "./testWallet";

// Browser-extension wallets only (MetaMask, Coinbase Wallet extension, Rabby…) — no WalletConnect project id
// needed. Mobile wallets use the QR code (EIP-681) path instead.
// NEXT_PUBLIC_DEV_TEST_WALLET=1 adds a clearly labelled dev-only test wallet (see api/dev/test-wallet).
const devTestWallet = process.env.NEXT_PUBLIC_DEV_TEST_WALLET === "1" && process.env.NODE_ENV !== "production";

const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    ...(devTestWallet
      ? [injected({ target: () => ({ id: "devTestWallet", name: "Test wallet (dev)", provider: createTestWalletProvider() as never }) })]
      : []),
  ],
  transports: { [baseSepolia.id]: http() },
  ssr: true,
  multiInjectedProviderDiscovery: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
