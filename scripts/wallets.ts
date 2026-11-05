// Prints the platform's testnet wallets and balances.  npm run wallets
import { loadEnv } from "../src/lib/env";
import { privateKeyToAccount } from "viem/accounts";

loadEnv();

async function main() {
  const { gasSponsor } = await import("../src/lib/hd");
  const { erc20Abi, publicClient } = await import("../src/lib/chain");
  const { LIVE_CHAIN } = await import("../src/config/chains");
  const c = publicClient();
  const rows: [string, `0x${string}`][] = [["gas sponsor (HD index 0)", gasSponsor().address]];
  if (process.env.TEST_BUYER_PRIVATE_KEY) rows.push(["test buyer", privateKeyToAccount(process.env.TEST_BUYER_PRIVATE_KEY as `0x${string}`).address]);
  for (const [label, address] of rows) {
    const [eth, usdc] = await Promise.all([
      c.getBalance({ address }),
      c.readContract({ address: LIVE_CHAIN.usdcAddress!, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    ]);
    console.log(`${label.padEnd(26)} ${address}  ${(Number(eth) / 1e18).toFixed(5)} ETH  ${(Number(usdc) / 1e6).toFixed(2)} USDC`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
